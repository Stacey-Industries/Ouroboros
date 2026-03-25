/** Discover and parse .ouroboros/skills/{name}/SKILL.md files. */

import type { SkillDefinition, SkillParameter } from '@shared/types/rulesAndSkills';
import fs from 'fs/promises';
import path from 'path';

const SKILLS_DIR = path.join('.ouroboros', 'skills');
const SKILL_FILE = 'SKILL.md';

// ─── Frontmatter parsing helpers ─────────────────────────────────────────────

function extractFrontmatter(source: string): { front: string; body: string } | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/m.exec(source);
  if (!match) return null;
  return { front: match[1], body: match[2].trim() };
}

function parseScalarField(front: string, key: string): string {
  // eslint-disable-next-line security/detect-non-literal-regexp -- pattern built from known frontmatter field names (name, description, etc.)
  const match = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(front);
  return match ? match[1].trim() : '';
}

function parseTagsField(front: string): string[] {
  const match = /^tags:\s*\[([^\]]*)\]/m.exec(front);
  if (match) {
    return match[1].split(',').map((t) => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }
  // eslint-disable-next-line security/detect-unsafe-regex -- bounded repetition; input is frontmatter from trusted skill files
  const listMatch = front.match(/^tags:\s*\n((?:\s*-\s*.+\n?)*)/m);
  if (!listMatch) return [];
  return listMatch[1]
    .split('\n')
    .map((l) => l.replace(/^\s*-\s*/, '').trim())
    .filter(Boolean);
}

function extractBlockField(block: string, field: string): string | undefined {
  // eslint-disable-next-line security/detect-non-literal-regexp -- pattern built from known frontmatter field names
  return new RegExp(`${field}:\\s*(.+)`).exec(block)?.[1]?.trim();
}

function buildSkillParameter(
  name: string,
  description: string,
  requiredStr: string,
  defaultVal: string | undefined,
): SkillParameter {
  return {
    name,
    description,
    required: requiredStr === 'true',
    ...(defaultVal !== undefined ? { default: defaultVal } : {}),
  };
}

function parseParameterBlock(block: string): SkillParameter | null {
  const name = extractBlockField(block, 'name') ?? '';
  if (!name) return null;
  const description = extractBlockField(block, 'description') ?? '';
  const requiredStr = extractBlockField(block, 'required') ?? 'false';
  const defaultVal = extractBlockField(block, 'default');
  return buildSkillParameter(name, description, requiredStr, defaultVal);
}

function parseParametersField(front: string): SkillParameter[] {
  const sectionMatch = /^parameters:\s*\n([\s\S]*?)(?=\n\S|$)/m.exec(front);
  if (!sectionMatch) return [];

  const blocks = sectionMatch[1].split(/(?=\n\s*-\s+name:)/);
  const params: SkillParameter[] = [];

  for (const block of blocks) {
    const param = parseParameterBlock(block);
    if (param) params.push(param);
  }

  return params;
}

// ─── File-level parse ────────────────────────────────────────────────────────

export async function parseSkillFile(
  filePath: string,
  dirName: string,
): Promise<SkillDefinition | null> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path composed from trusted projectRoot + known skills dir + readdir entry
    const source = await fs.readFile(filePath, 'utf8');
    const parts = extractFrontmatter(source);
    if (!parts || !parts.body) return null;

    const { front, body } = parts;
    return {
      id: dirName,
      name: parseScalarField(front, 'name') || dirName,
      description: parseScalarField(front, 'description'),
      parameters: parseParametersField(front),
      tags: parseTagsField(front),
      filePath,
      body,
    };
  } catch {
    return null;
  }
}

// ─── Directory scan ───────────────────────────────────────────────────────────

async function getSkillSubdirs(skillsRoot: string): Promise<string[]> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path composed from trusted projectRoot + known skills dir
    const entries = await fs.readdir(skillsRoot, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function discoverSkills(projectRoot: string): Promise<SkillDefinition[]> {
  const skillsRoot = path.join(projectRoot, SKILLS_DIR);
  const subdirs = await getSkillSubdirs(skillsRoot);

  const results = await Promise.all(
    subdirs.map((dirName) => {
      const filePath = path.join(skillsRoot, dirName, SKILL_FILE);
      return parseSkillFile(filePath, dirName);
    }),
  );

  return results.filter((s): s is SkillDefinition => s !== null);
}
