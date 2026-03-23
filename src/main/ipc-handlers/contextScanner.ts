/**
 * contextScanner.ts — Project scanner decomposed into per-language phases.
 */

import fs from 'fs/promises';
import path from 'path';

import {
  CONFIG_FILES,
  detectCommonPatterns,
  detectFramework,
  detectPatterns,
  detectTestFramework,
  DIR_PURPOSES,
  fileExists,
  readJsonSafe,
  readTextSafe,
} from './contextDetectors';
import type { ProjectContext } from './contextTypes';

// ─── Phase: collect dirs and configs ──────────────────────────────────────────

async function collectDirsAndConfigs(
  projectRoot: string,
  topEntries: string[],
  ctx: ProjectContext,
): Promise<void> {
  for (const entry of topEntries) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from project root directory listing
      const stat = await fs.stat(path.join(projectRoot, entry));
      // eslint-disable-next-line security/detect-object-injection -- entry from fs.readdir
      if (stat.isDirectory() && DIR_PURPOSES[entry]) {
        // eslint-disable-next-line security/detect-object-injection -- entry from fs.readdir
        ctx.keyDirs.push({ path: entry, purpose: DIR_PURPOSES[entry] });
      }
    } catch {
      // skip inaccessible entries
    }
  }
  for (const cf of CONFIG_FILES) {
    if (await fileExists(path.join(projectRoot, cf))) {
      ctx.keyConfigs.push(cf);
    }
  }
}

// ─── Phase: Node.js / JS / TS ────────────────────────────────────────────────

async function scanNodeProject(projectRoot: string, ctx: ProjectContext): Promise<boolean> {
  const pkgJson = await readJsonSafe(path.join(projectRoot, 'package.json'));
  if (!pkgJson) return false;

  const allDeps = mergeDeps(pkgJson);
  ctx.packageManager = await detectPackageManager(projectRoot);
  ctx.language =
    allDeps['typescript'] || ctx.keyConfigs.includes('tsconfig.json') ? 'TypeScript' : 'JavaScript';
  ctx.framework = detectFramework(allDeps);
  ctx.testFramework = detectTestFramework(allDeps);
  collectBuildCommands(pkgJson, ctx);
  collectNodeEntryPoints(pkgJson, ctx);
  collectDependencies(pkgJson, ctx);
  ctx.detectedPatterns.push(...(await detectPatterns(allDeps, projectRoot, ctx.keyConfigs)));

  // Detect JS/TS entry point files
  if (ctx.entryPoints.length === 0) {
    await detectJsTsEntryPoints(projectRoot, ctx);
  }
  return true;
}

function findMatchingFramework(content: string): string | null {
  const frameworks: Array<[string, RegExp]> = [
    ['Django', /django/i],
    ['FastAPI', /fastapi/i],
    ['Flask', /flask/i],
  ];
  for (const [name, pattern] of frameworks) {
    if (pattern.test(content)) return name;
  }
  return null;
}

async function addExistingEntries(
  root: string,
  entries: string[],
  target: string[],
): Promise<void> {
  for (const entry of entries) {
    if (await fileExists(path.join(root, entry))) target.push(entry);
  }
}

async function addDetectedPatterns(
  root: string,
  checks: Array<[string, string]>,
  target: string[],
): Promise<void> {
  for (const [fileName, label] of checks) {
    if (await fileExists(path.join(root, fileName))) target.push(label);
  }
}

function mergeDeps(pkgJson: Record<string, unknown>): Record<string, string> {
  return {
    ...((pkgJson.dependencies as Record<string, string> | undefined) ?? {}),
    ...((pkgJson.devDependencies as Record<string, string> | undefined) ?? {}),
  };
}

async function detectPackageManager(root: string): Promise<ProjectContext['packageManager']> {
  if (
    (await fileExists(path.join(root, 'bun.lockb'))) ||
    (await fileExists(path.join(root, 'bun.lock')))
  )
    return 'bun';
  if (await fileExists(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await fileExists(path.join(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function collectBuildCommands(pkgJson: Record<string, unknown>, ctx: ProjectContext): void {
  const scripts = pkgJson.scripts as Record<string, string> | undefined;
  if (!scripts) return;
  const interesting = [
    'dev',
    'start',
    'build',
    'test',
    'lint',
    'format',
    'typecheck',
    'check',
    'preview',
    'deploy',
  ];
  for (const name of interesting) {
    // eslint-disable-next-line security/detect-object-injection -- name from hardcoded interesting array
    if (scripts[name]) {
      ctx.buildCommands.push({
        name: `${ctx.packageManager ?? 'npm'} run ${name}`,
        // eslint-disable-next-line security/detect-object-injection -- name from hardcoded interesting array
        command: scripts[name],
      });
    }
  }
}

function collectNodeEntryPoints(pkgJson: Record<string, unknown>, ctx: ProjectContext): void {
  if (typeof pkgJson.main === 'string') {
    ctx.entryPoints.push(pkgJson.main as string);
  }
}

function collectDependencies(pkgJson: Record<string, unknown>, ctx: ProjectContext): void {
  const deps = pkgJson.dependencies as Record<string, string> | undefined;
  if (!deps) return;
  for (const [name, version] of Object.entries(deps)) {
    ctx.dependencies.push({ name, version });
  }
}

async function detectJsTsEntryPoints(root: string, ctx: ProjectContext): Promise<void> {
  const candidates = [
    'src/main.ts',
    'src/main.tsx',
    'src/index.ts',
    'src/index.tsx',
    'src/main.js',
    'src/index.js',
    'src/app.ts',
    'src/app.tsx',
    'src/app.js',
    'index.ts',
    'index.js',
    'server.ts',
    'server.js',
  ];
  for (const c of candidates) {
    if (await fileExists(path.join(root, c))) ctx.entryPoints.push(c);
  }
}

// ─── Phase: Rust ──────────────────────────────────────────────────────────────

async function scanRustProject(root: string, ctx: ProjectContext): Promise<boolean> {
  if (!(await fileExists(path.join(root, 'Cargo.toml')))) return false;

  ctx.language = 'Rust';
  ctx.packageManager = 'cargo';
  ctx.testFramework = 'cargo test';
  ctx.buildCommands.push(
    { name: 'cargo build', command: 'cargo build' },
    { name: 'cargo test', command: 'cargo test' },
    { name: 'cargo run', command: 'cargo run' },
  );
  const content = await readTextSafe(path.join(root, 'Cargo.toml'));
  if (content?.includes('[workspace]')) ctx.detectedPatterns.push('Cargo workspace');
  const nameMatch = content?.match(/^name\s*=\s*"([^"]+)"/m);
  if (nameMatch) ctx.name = nameMatch[1];
  if (await fileExists(path.join(root, 'src', 'main.rs'))) ctx.entryPoints.push('src/main.rs');
  if (await fileExists(path.join(root, 'src', 'lib.rs'))) ctx.entryPoints.push('src/lib.rs');
  return true;
}

// ─── Phase: Python ────────────────────────────────────────────────────────────

async function scanPythonProject(root: string, ctx: ProjectContext): Promise<boolean> {
  const hasPyproject = await fileExists(path.join(root, 'pyproject.toml'));
  const hasSetupPy = await fileExists(path.join(root, 'setup.py'));
  if (!hasPyproject && !hasSetupPy) return false;

  ctx.language = 'Python';
  ctx.packageManager = 'pip';
  const reqContent = await readTextSafe(path.join(root, 'requirements.txt'));
  const pyContent = await readTextSafe(path.join(root, 'pyproject.toml'));
  const combined = (reqContent ?? '') + (pyContent ?? '');

  ctx.framework = findMatchingFramework(combined);
  ctx.testFramework = /pytest/i.test(combined) ? 'pytest' : null;
  await addExistingEntries(
    root,
    ['app.py', 'main.py', 'manage.py', 'wsgi.py', 'asgi.py'],
    ctx.entryPoints,
  );
  ctx.buildCommands.push({ name: 'pip install', command: 'pip install -e .' });
  if (ctx.testFramework === 'pytest') ctx.buildCommands.push({ name: 'pytest', command: 'pytest' });
  await addDetectedPatterns(
    root,
    [
      ['poetry.lock', 'Poetry'],
      ['uv.lock', 'uv package manager'],
    ],
    ctx.detectedPatterns,
  );
  return true;
}

// ─── Phase: Go ────────────────────────────────────────────────────────────────

async function scanGoProject(root: string, ctx: ProjectContext): Promise<boolean> {
  if (!(await fileExists(path.join(root, 'go.mod')))) return false;
  ctx.language = 'Go';
  ctx.packageManager = 'go';
  ctx.testFramework = 'go test';
  ctx.buildCommands.push(
    { name: 'go build', command: 'go build ./...' },
    { name: 'go test', command: 'go test ./...' },
    { name: 'go run', command: 'go run .' },
  );
  if (await fileExists(path.join(root, 'main.go'))) ctx.entryPoints.push('main.go');
  if (await fileExists(path.join(root, 'cmd'))) ctx.entryPoints.push('cmd/');
  return true;
}

// ─── Phase: Ruby ──────────────────────────────────────────────────────────────

async function scanRubyProject(root: string, ctx: ProjectContext): Promise<boolean> {
  if (!(await fileExists(path.join(root, 'Gemfile')))) return false;
  ctx.language = 'Ruby';
  const gemContent = await readTextSafe(path.join(root, 'Gemfile'));
  if (gemContent && /rails/i.test(gemContent)) ctx.framework = 'Ruby on Rails';
  ctx.testFramework = 'rspec';
  ctx.buildCommands.push({ name: 'bundle install', command: 'bundle install' });
  return true;
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

export async function scanProject(projectRoot: string): Promise<ProjectContext> {
  const ctx: ProjectContext = {
    name: path.basename(projectRoot),
    language: 'Unknown',
    framework: null,
    packageManager: null,
    entryPoints: [],
    keyDirs: [],
    keyConfigs: [],
    testFramework: null,
    buildCommands: [],
    dependencies: [],
    hasClaudeMd: false,
    detectedPatterns: [],
  };

  ctx.hasClaudeMd = await fileExists(path.join(projectRoot, 'CLAUDE.md'));

  let topEntries: string[] = [];
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- projectRoot is the validated workspace root
    topEntries = await fs.readdir(projectRoot);
  } catch {
    return ctx;
  }

  await collectDirsAndConfigs(projectRoot, topEntries, ctx);

  // Try each language detector in order; non-Node ones only run if package.json was absent
  const isNode = await scanNodeProject(projectRoot, ctx);
  if (!isNode) {
    const scanners = [scanRustProject, scanPythonProject, scanGoProject, scanRubyProject];
    for (const scanProject of scanners) {
      const detected = await scanProject(projectRoot, ctx);
      if (detected) {
        break;
      }
    }
  }

  await detectCommonPatterns(projectRoot, ctx);
  return ctx;
}
