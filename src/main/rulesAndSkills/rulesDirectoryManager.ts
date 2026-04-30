/**
 * rulesDirectoryManager.ts — CRUD for .claude/rules/*.md files.
 *
 * Writes to ~/.claude/rules/ (global) or {projectRoot}/.claude/rules/ (project).
 * Disabled rules live in the sibling <rules-root>-disabled/ directory.
 */

import type { ClaudeConfigScope, RuleDefinition } from '@shared/types/claudeConfig';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const CLAUDE_DIR = '.claude';
const RULES_DIR = 'rules';
const RULES_DISABLED_DIR = 'rules-disabled';
const MD_EXT = '.md';
const DESC_MAX_LEN = 80;

function resolveRulesDir(scope: ClaudeConfigScope, projectRoot?: string): string {
  if (scope === 'global') {
    return path.join(os.homedir(), CLAUDE_DIR, RULES_DIR);
  }
  if (!projectRoot) throw new Error('projectRoot required for project scope');
  return path.join(projectRoot, CLAUDE_DIR, RULES_DIR);
}

/** Resolves the sibling disabled dir, e.g. ~/.claude/rules-disabled/ */
function resolveDisabledDir(scope: ClaudeConfigScope, projectRoot?: string): string {
  if (scope === 'global') {
    return path.join(os.homedir(), CLAUDE_DIR, RULES_DISABLED_DIR);
  }
  if (!projectRoot) throw new Error('projectRoot required for project scope');
  return path.join(projectRoot, CLAUDE_DIR, RULES_DISABLED_DIR);
}

/** Sanitizes a rule name to safe filesystem characters. */
function sanitizeName(name: string): string {
  return path.basename(name).replace(/[^a-zA-Z0-9_-]/g, '-');
}

function resolveRulePath(scope: ClaudeConfigScope, name: string, projectRoot?: string): string {
  const dir = resolveRulesDir(scope, projectRoot);
  return path.join(dir, sanitizeName(name) + MD_EXT);
}

function extractDescription(content: string): string {
  const firstLine = content.split('\n').find((line) => line.trim().length > 0);
  if (!firstLine) return '';
  const trimmed = firstLine.trim();
  return trimmed.length > DESC_MAX_LEN ? trimmed.slice(0, DESC_MAX_LEN) : trimmed;
}

async function scanDir(
  dirPath: string,
  scope: ClaudeConfigScope,
  disabled: boolean,
): Promise<RuleDefinition[]> {
  let entries: string[];
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir from resolveRulesDir / resolveDisabledDir
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
        disabled,
      });
    } catch {
      // skip unreadable files
    }
  }
  return results;
}

/** Discover all rule .md files from global and/or project scopes, including disabled ones. */
export async function discoverRuleFiles(projectRoot?: string): Promise<RuleDefinition[]> {
  const globalDir = resolveRulesDir('global');
  const globalDisabledDir = resolveDisabledDir('global');
  const globalRules = await scanDir(globalDir, 'global', false);
  const globalDisabled = await scanDir(globalDisabledDir, 'global', true);

  if (!projectRoot) return [...globalRules, ...globalDisabled];

  const projectDir = resolveRulesDir('project', projectRoot);
  const projectDisabledDir = resolveDisabledDir('project', projectRoot);
  const projectRules = await scanDir(projectDir, 'project', false);
  const projectDisabled = await scanDir(projectDisabledDir, 'project', true);
  return [...globalRules, ...globalDisabled, ...projectRules, ...projectDisabled];
}

/**
 * Moves a rule from the active dir to the disabled sibling dir.
 * Throws if the source doesn't exist or a same-named file already exists in disabled dir.
 */
export async function disableRule(
  scope: ClaudeConfigScope,
  name: string,
  projectRoot?: string,
): Promise<void> {
  const safeName = sanitizeName(name);
  const activeDir = resolveRulesDir(scope, projectRoot);
  const disabledDir = resolveDisabledDir(scope, projectRoot);
  const src = path.join(activeDir, safeName + MD_EXT);
  const dst = path.join(disabledDir, safeName + MD_EXT);

  await fs.access(src).catch(() => {
    throw new Error(`Rule not found: ${safeName}`);
  });

  const collision = await fs
    .access(dst)
    .then(() => true)
    .catch(() => false);
  if (collision) {
    throw new Error(`Rule already exists in disabled dir: ${safeName}`);
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir from resolveDisabledDir
  await fs.mkdir(disabledDir, { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- paths from resolved dirs + sanitized name
  await fs.rename(src, dst);
}

/**
 * Moves a rule from the disabled sibling dir back to the active dir.
 * Throws if the source doesn't exist in disabled dir or a collision exists in active dir.
 */
export async function enableRule(
  scope: ClaudeConfigScope,
  name: string,
  projectRoot?: string,
): Promise<void> {
  const safeName = sanitizeName(name);
  const activeDir = resolveRulesDir(scope, projectRoot);
  const disabledDir = resolveDisabledDir(scope, projectRoot);
  const src = path.join(disabledDir, safeName + MD_EXT);
  const dst = path.join(activeDir, safeName + MD_EXT);

  await fs.access(src).catch(() => {
    throw new Error(`Rule not found in disabled dir: ${safeName}`);
  });

  const collision = await fs
    .access(dst)
    .then(() => true)
    .catch(() => false);
  if (collision) {
    throw new Error(`Rule already exists in active dir: ${safeName}`);
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir from resolveRulesDir
  await fs.mkdir(activeDir, { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- paths from resolved dirs + sanitized name
  await fs.rename(src, dst);
}

/**
 * Moves every *.md from the disabled sibling dir back to the active dir.
 * Skips (doesn't throw) on same-named collision in the active dir.
 * Returns counts of restored and skipped files.
 */
export async function restoreAllDisabled(
  scope: ClaudeConfigScope,
  projectRoot?: string,
): Promise<{ restored: number; skipped: number }> {
  const activeDir = resolveRulesDir(scope, projectRoot);
  const disabledDir = resolveDisabledDir(scope, projectRoot);

  let entries: string[];
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir from resolveDisabledDir
    entries = await fs.readdir(disabledDir);
  } catch {
    return { restored: 0, skipped: 0 };
  }

  const mdEntries = entries.filter((e) => e.endsWith(MD_EXT));
  if (mdEntries.length === 0) return { restored: 0, skipped: 0 };

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir from resolveRulesDir
  await fs.mkdir(activeDir, { recursive: true });

  let restored = 0;
  let skipped = 0;

  for (const entry of mdEntries) {
    const src = path.join(disabledDir, entry);
    const dst = path.join(activeDir, entry);

    const collision = await fs
      .access(dst)
      .then(() => true)
      .catch(() => false);
    if (collision) {
      skipped++;
      continue;
    }
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- paths from readdir entry
      await fs.rename(src, dst);
      restored++;
    } catch {
      skipped++;
    }
  }

  return { restored, skipped };
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
