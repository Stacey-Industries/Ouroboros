/**
 * contextDetectors.ts — Framework, test, and pattern detection logic.
 *
 * Extracted from context.ts to keep each file under 300 lines.
 */

import fs from 'fs/promises'
import path from 'path'
import type { ProjectContext } from './contextTypes'

// ─── Helpers ────────────────────────────────────────────────────────────────

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function readJsonSafe(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function readTextSafe(filePath: string, maxBytes = 8192): Promise<string | null> {
  try {
    const handle = await fs.open(filePath, 'r')
    try {
      const buf = Buffer.alloc(maxBytes)
      const { bytesRead } = await handle.read(buf, 0, maxBytes, 0)
      return buf.toString('utf-8', 0, bytesRead)
    } finally {
      await handle.close()
    }
  } catch {
    return null
  }
}

// ─── Detection data ──────────────────────────────────────────────────────────

export const FRAMEWORK_SIGNATURES: Record<string, { deps: string[]; label: string }> = {
  'next': { deps: ['next'], label: 'Next.js' },
  'nuxt': { deps: ['nuxt', 'nuxt3'], label: 'Nuxt' },
  'remix': { deps: ['@remix-run/node', '@remix-run/react'], label: 'Remix' },
  'astro': { deps: ['astro'], label: 'Astro' },
  'sveltekit': { deps: ['@sveltejs/kit'], label: 'SvelteKit' },
  'gatsby': { deps: ['gatsby'], label: 'Gatsby' },
  'react': { deps: ['react'], label: 'React' },
  'vue': { deps: ['vue'], label: 'Vue' },
  'svelte': { deps: ['svelte'], label: 'Svelte' },
  'angular': { deps: ['@angular/core'], label: 'Angular' },
  'express': { deps: ['express'], label: 'Express' },
  'fastify': { deps: ['fastify'], label: 'Fastify' },
  'hono': { deps: ['hono'], label: 'Hono' },
  'nestjs': { deps: ['@nestjs/core'], label: 'NestJS' },
  'electron': { deps: ['electron'], label: 'Electron' },
  'tauri': { deps: ['@tauri-apps/api'], label: 'Tauri' },
  'django': { deps: ['django', 'Django'], label: 'Django' },
  'flask': { deps: ['flask', 'Flask'], label: 'Flask' },
  'fastapi': { deps: ['fastapi'], label: 'FastAPI' },
  'rails': { deps: ['rails'], label: 'Ruby on Rails' },
}

export const TEST_FRAMEWORKS: Record<string, string[]> = {
  'vitest': ['vitest'],
  'jest': ['jest', '@jest/core'],
  'mocha': ['mocha'],
  'ava': ['ava'],
  'tap': ['tap'],
  'pytest': ['pytest'],
  'unittest': [],
  'rspec': ['rspec'],
  'cargo test': [],
  'go test': [],
}

export const DIR_PURPOSES: Record<string, string> = {
  'src': 'Source code',
  'lib': 'Library code',
  'app': 'Application code (may contain routes/pages)',
  'pages': 'Page routes',
  'components': 'UI components',
  'hooks': 'Custom hooks',
  'utils': 'Utility functions',
  'helpers': 'Helper functions',
  'types': 'Type definitions',
  'models': 'Data models',
  'services': 'Service layer',
  'api': 'API routes or handlers',
  'routes': 'Route definitions',
  'middleware': 'Middleware functions',
  'controllers': 'Controller layer',
  'views': 'View templates',
  'templates': 'Template files',
  'static': 'Static assets',
  'public': 'Public assets (served directly)',
  'assets': 'Assets (images, fonts, etc.)',
  'styles': 'Stylesheets',
  'css': 'CSS files',
  'config': 'Configuration files',
  'scripts': 'Build/utility scripts',
  'test': 'Test files',
  'tests': 'Test files',
  '__tests__': 'Test files (Jest convention)',
  'spec': 'Test specifications',
  'e2e': 'End-to-end tests',
  'docs': 'Documentation',
  'doc': 'Documentation',
  'migrations': 'Database migrations',
  'prisma': 'Prisma schema and migrations',
  'db': 'Database configuration',
  'locales': 'Internationalization files',
  'i18n': 'Internationalization',
  'plugins': 'Plugin modules',
  'extensions': 'Extension modules',
  '.github': 'GitHub workflows and config',
  '.vscode': 'VS Code workspace settings',
  'dist': 'Build output',
  'build': 'Build output',
  'out': 'Build output',
  'node_modules': 'npm dependencies (auto-managed)',
  'vendor': 'Vendored dependencies',
  'packages': 'Monorepo packages',
  'apps': 'Monorepo applications',
  'crates': 'Rust workspace crates',
}

export const CONFIG_FILES = [
  'tsconfig.json', 'jsconfig.json',
  '.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', 'eslint.config.js', 'eslint.config.mjs',
  '.prettierrc', '.prettierrc.js', '.prettierrc.json', 'prettier.config.js',
  'vite.config.ts', 'vite.config.js', 'vite.config.mts',
  'webpack.config.js', 'webpack.config.ts',
  'rollup.config.js', 'rollup.config.mjs',
  'esbuild.config.js', 'esbuild.config.mjs',
  'turbo.json', 'nx.json', 'lerna.json',
  '.babelrc', 'babel.config.js', 'babel.config.json',
  'tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.mjs',
  'postcss.config.js', 'postcss.config.cjs',
  'jest.config.js', 'jest.config.ts', 'jest.config.json',
  'vitest.config.ts', 'vitest.config.js',
  '.env', '.env.example', '.env.local',
  'docker-compose.yml', 'docker-compose.yaml', 'Dockerfile',
  'Makefile', '.github/workflows',
  'vercel.json', 'netlify.toml',
  'electron-builder.yml', 'electron-builder.json5',
  'pyproject.toml', 'setup.py', 'setup.cfg',
  'Cargo.toml', 'go.mod', 'Gemfile', '.gitignore',
]

const MONOREPO_MARKERS = [
  'pnpm-workspace.yaml',
  'lerna.json',
  'turbo.json',
  'nx.json',
]

const DEPENDENCY_PATTERNS = [
  { label: 'Tailwind CSS', matches: (allDeps: Record<string, string>) => Boolean(allDeps['tailwindcss']) },
  { label: 'Prisma ORM', matches: (allDeps: Record<string, string>) => Boolean(allDeps['prisma'] || allDeps['@prisma/client']) },
  { label: 'Drizzle ORM', matches: (allDeps: Record<string, string>) => Boolean(allDeps['drizzle-orm']) },
  { label: 'tRPC', matches: (allDeps: Record<string, string>) => Boolean(allDeps['trpc'] || allDeps['@trpc/server']) },
  {
    label: 'GraphQL',
    matches: (allDeps: Record<string, string>) =>
      Boolean(allDeps['graphql'] || allDeps['@apollo/client'] || allDeps['@graphql-tools/schema']),
  },
  {
    label: 'Docker',
    matches: (allDeps: Record<string, string>, keyConfigs: string[]) =>
      Boolean(allDeps['docker-compose'] || keyConfigs.some((c) => c.startsWith('docker'))),
  },
  { label: 'Electron app', matches: (allDeps: Record<string, string>) => Boolean(allDeps['electron']) },
]

// ─── Detection functions ─────────────────────────────────────────────────────

export function detectFramework(allDeps: Record<string, string>): string | null {
  let framework: string | null = null
  for (const [, sig] of Object.entries(FRAMEWORK_SIGNATURES)) {
    if (sig.deps.some((d) => d in allDeps)) {
      if (!framework || sig.label.length > framework.length) {
        framework = sig.label
      }
    }
  }
  // Prioritize specific frameworks over generic
  const specific = ['next', 'nuxt', 'remix', 'sveltekit', 'astro', 'gatsby']
  for (const key of specific) {
    const sig = FRAMEWORK_SIGNATURES[key]
    if (sig.deps.some((d) => d in allDeps)) {
      return sig.label
    }
  }
  return framework
}

export function detectTestFramework(allDeps: Record<string, string>): string | null {
  for (const [name, deps] of Object.entries(TEST_FRAMEWORKS)) {
    if (deps.length > 0 && deps.some((d) => d in allDeps)) {
      return name
    }
  }
  return null
}

async function detectTypeScriptPatterns(
  allDeps: Record<string, string>,
  projectRoot: string
): Promise<string[]> {
  if (!allDeps['typescript']) {
    return []
  }

  const patterns: string[] = []
  const tsconfig = await readJsonSafe(path.join(projectRoot, 'tsconfig.json'))
  const compilerOptions = tsconfig?.compilerOptions as Record<string, unknown> | undefined
  if (compilerOptions?.strict === true) {
    patterns.push('TypeScript strict mode')
  }
  const moduleType = compilerOptions?.module
  if (typeof moduleType === 'string' && ['esnext', 'es2020', 'es2022', 'nodenext', 'node16'].includes(moduleType)) {
    patterns.push('ESM modules')
  }
  return patterns
}

async function readPackageJson(projectRoot: string): Promise<Record<string, unknown> | null> {
  return readJsonSafe(path.join(projectRoot, 'package.json'))
}

async function isMonorepoProject(
  projectRoot: string,
  pkg: Record<string, unknown> | null
): Promise<boolean> {
  if (pkg?.workspaces) {
    return true
  }
  for (const marker of MONOREPO_MARKERS) {
    if (await fileExists(path.join(projectRoot, marker))) {
      return true
    }
  }
  return false
}

async function detectProjectPatterns(projectRoot: string): Promise<string[]> {
  const pkg = await readPackageJson(projectRoot)
  const patterns: string[] = []
  if (pkg?.type === 'module') {
    patterns.push('ESM modules')
  }
  if (await isMonorepoProject(projectRoot, pkg)) {
    patterns.push('Monorepo')
  }
  return patterns
}

function detectDependencyPatterns(
  allDeps: Record<string, string>,
  keyConfigs: string[]
): string[] {
  return DEPENDENCY_PATTERNS
    .filter(({ matches }) => matches(allDeps, keyConfigs))
    .map(({ label }) => label)
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
  ])
  return Array.from(patterns)
}

export async function detectCommonPatterns(
  projectRoot: string,
  context: ProjectContext,
): Promise<void> {
  if (await fileExists(path.join(projectRoot, 'Makefile'))) {
    context.detectedPatterns.push('Makefile build')
  }
  if (await fileExists(path.join(projectRoot, '.github', 'workflows'))) {
    context.detectedPatterns.push('GitHub Actions CI')
  }
  if (await fileExists(path.join(projectRoot, '.git'))) {
    context.detectedPatterns.push('Git repository')
  }
}
