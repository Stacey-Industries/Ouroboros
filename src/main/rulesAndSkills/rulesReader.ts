/** Read CLAUDE.md and AGENTS.md from the project root. */

import type { OrchestrationProvider } from '@shared/types/orchestrationDomain';
import type { RulesFile } from '@shared/types/rulesAndSkills';
import fs from 'fs/promises';
import path from 'path';

const MAX_RULES_SIZE = 12288; // 12 KB

const TRUNCATION_NOTE =
  '\n\n[... content truncated — file exceeds 12 KB limit ...]';

function fileNameForType(type: 'claude-md' | 'agents-md'): string {
  return type === 'claude-md' ? 'CLAUDE.md' : 'AGENTS.md';
}

function truncateIfOversized(content: string): string {
  if (content.length <= MAX_RULES_SIZE) return content;
  return content.slice(0, MAX_RULES_SIZE) + TRUNCATION_NOTE;
}

function buildMissingResult(
  type: 'claude-md' | 'agents-md',
  filePath: string,
): RulesFile {
  return { type, filePath, exists: false };
}

function buildFoundResult(
  type: 'claude-md' | 'agents-md',
  filePath: string,
  raw: string,
  stat: { size: number; mtimeMs: number },
): RulesFile {
  return {
    type,
    filePath,
    exists: true,
    content: truncateIfOversized(raw),
    sizeBytes: stat.size,
    lastModified: stat.mtimeMs,
  };
}

export async function readRulesFile(
  projectRoot: string,
  type: 'claude-md' | 'agents-md',
): Promise<RulesFile> {
  const filePath = path.join(projectRoot, fileNameForType(type));

  try {
    const [raw, stat] = await Promise.all([
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from projectRoot + known filename
      fs.readFile(filePath, 'utf8'),
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from projectRoot + known filename
      fs.stat(filePath),
    ]);
    return buildFoundResult(type, filePath, raw, stat);
  } catch {
    return buildMissingResult(type, filePath);
  }
}

export async function listRulesFiles(projectRoot: string): Promise<RulesFile[]> {
  return Promise.all([
    readRulesFile(projectRoot, 'claude-md'),
    readRulesFile(projectRoot, 'agents-md'),
  ]);
}

export async function readRulesForProvider(
  projectRoot: string,
  provider: OrchestrationProvider,
): Promise<string | null> {
  const type = provider === 'codex' ? 'agents-md' : 'claude-md';
  const result = await readRulesFile(projectRoot, type);
  return result.content ?? null;
}
