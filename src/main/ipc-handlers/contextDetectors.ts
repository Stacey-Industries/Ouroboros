/**
 * contextDetectors.ts — Framework, test, and pattern detection logic.
 *
 * Extracted from context.ts to keep each file under 300 lines.
 */

import fs from 'fs/promises';
import path from 'path';

import {
  DEPENDENCY_PATTERNS,
  FRAMEWORK_SIGNATURES,
  MONOREPO_MARKERS,
  TEST_FRAMEWORKS,
} from './contextDetectorsHelpers';
import type { ProjectContext } from './contextTypes';

// Re-export constants consumed by contextScanner.ts and contextGenerator.ts
export {
  CONFIG_FILES,
  DEPENDENCY_PATTERNS,
  DIR_PURPOSES,
  FRAMEWORK_SIGNATURES,
  TEST_FRAMEWORKS,
} from './contextDetectorsHelpers';

// ─── Helpers ────────────────────────────────────────────────────────────────

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonSafe(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath from internal project scan
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function readTextSafe(filePath: string, maxBytes = 8192): Promise<string | null> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath from internal project scan
    const handle = await fs.open(filePath, 'r');
    try {
      const buf = Buffer.alloc(maxBytes);
      const { bytesRead } = await handle.read(buf, 0, maxBytes, 0);
      return buf.toString('utf-8', 0, bytesRead);
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

// ─── Detection functions ─────────────────────────────────────────────────────

export function detectFramework(allDeps: Record<string, string>): string | null {
  let framework: string | null = null;
  for (const [, sig] of Object.entries(FRAMEWORK_SIGNATURES)) {
    if (sig.deps.some((d) => d in allDeps)) {
      if (!framework || sig.label.length > framework.length) {
        framework = sig.label;
      }
    }
  }
  // Prioritize specific frameworks over generic
  const specific = ['next', 'nuxt', 'remix', 'sveltekit', 'astro', 'gatsby'];
  for (const key of specific) {
    // eslint-disable-next-line security/detect-object-injection -- key from hardcoded specific array
    const sig = FRAMEWORK_SIGNATURES[key];
    if (sig.deps.some((d) => d in allDeps)) {
      return sig.label;
    }
  }
  return framework;
}

export function detectTestFramework(allDeps: Record<string, string>): string | null {
  for (const [name, deps] of Object.entries(TEST_FRAMEWORKS)) {
    if (deps.length > 0 && deps.some((d) => d in allDeps)) {
      return name;
    }
  }
  return null;
}

async function detectTypeScriptPatterns(
  allDeps: Record<string, string>,
  projectRoot: string,
): Promise<string[]> {
  if (!allDeps['typescript']) return [];
  const patterns: string[] = [];
  const tsconfig = await readJsonSafe(path.join(projectRoot, 'tsconfig.json'));
  const compilerOptions = tsconfig?.compilerOptions as Record<string, unknown> | undefined;
  if (compilerOptions?.strict === true) patterns.push('TypeScript strict mode');
  const moduleType = compilerOptions?.module;
  if (
    typeof moduleType === 'string' &&
    ['esnext', 'es2020', 'es2022', 'nodenext', 'node16'].includes(moduleType)
  ) {
    patterns.push('ESM modules');
  }
  return patterns;
}

async function readPackageJson(projectRoot: string): Promise<Record<string, unknown> | null> {
  return readJsonSafe(path.join(projectRoot, 'package.json'));
}

async function isMonorepoProject(
  projectRoot: string,
  pkg: Record<string, unknown> | null,
): Promise<boolean> {
  if (pkg?.workspaces) return true;
  for (const marker of MONOREPO_MARKERS) {
    if (await fileExists(path.join(projectRoot, marker))) return true;
  }
  return false;
}

async function detectProjectPatterns(projectRoot: string): Promise<string[]> {
  const pkg = await readPackageJson(projectRoot);
  const patterns: string[] = [];
  if (pkg?.type === 'module') patterns.push('ESM modules');
  if (await isMonorepoProject(projectRoot, pkg)) patterns.push('Monorepo');
  return patterns;
}

function detectDependencyPatterns(allDeps: Record<string, string>, keyConfigs: string[]): string[] {
  return DEPENDENCY_PATTERNS.filter(({ matches }) => matches(allDeps, keyConfigs)).map(
    ({ label }) => label,
  );
}

export async function detectPatterns(
  allDeps: Record<string, string>,
  projectRoot: string,
  keyConfigs: string[],
): Promise<string[]> {
  const patterns = new Set<string>([
    ...(await detectTypeScriptPatterns(allDeps, projectRoot)),
    ...(await detectProjectPatterns(projectRoot)),
    ...detectDependencyPatterns(allDeps, keyConfigs),
  ]);
  return Array.from(patterns);
}

export async function detectCommonPatterns(
  projectRoot: string,
  context: ProjectContext,
): Promise<void> {
  if (await fileExists(path.join(projectRoot, 'Makefile'))) {
    context.detectedPatterns.push('Makefile build');
  }
  if (await fileExists(path.join(projectRoot, '.github', 'workflows'))) {
    context.detectedPatterns.push('GitHub Actions CI');
  }
  if (await fileExists(path.join(projectRoot, '.git'))) {
    context.detectedPatterns.push('Git repository');
  }
}
