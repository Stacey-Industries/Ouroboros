/**
 * ipc-handlers/context.ts — Project context scanner and CLAUDE.md generator.
 *
 * Scans a project directory to detect tech stack, framework, entry points,
 * key directories, config files, and build commands. Generates a structured
 * CLAUDE.md-formatted summary that can be injected as a system prompt or
 * written to the project root.
 */

import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron'
import fs from 'fs/promises'
import path from 'path'

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProjectContext {
  name: string
  language: string
  framework: string | null
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'cargo' | 'pip' | 'go' | 'bun' | null
  entryPoints: string[]
  keyDirs: Array<{ path: string; purpose: string }>
  keyConfigs: string[]
  testFramework: string | null
  buildCommands: Array<{ name: string; command: string }>
  dependencies: Array<{ name: string; version: string }>
  hasClaudeMd: boolean
  detectedPatterns: string[]
}

export interface ContextGenerateOptions {
  includeCommands?: boolean
  includeDeps?: boolean
  includeStructure?: boolean
  maxDeps?: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function readJsonSafe(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content) as Record<string, unknown>
  } catch {
    return null
  }
}

async function readTextSafe(filePath: string, maxBytes = 8192): Promise<string | null> {
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

// ─── Detectors ──────────────────────────────────────────────────────────────

const FRAMEWORK_SIGNATURES: Record<string, { deps: string[]; label: string }> = {
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

const TEST_FRAMEWORKS: Record<string, string[]> = {
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

const DIR_PURPOSES: Record<string, string> = {
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

const CONFIG_FILES = [
  'tsconfig.json', 'jsconfig.json',
  '.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', 'eslint.config.js', 'eslint.config.mjs',
  '.prettierrc', '.prettierrc.js', '.prettierrc.json', 'prettier.config.js',
  'vite.config.ts', 'vite.config.js', 'vite.config.mts',
  'webpack.config.js', 'webpack.config.ts',
  'rollup.config.js', 'rollup.config.mjs',
  'esbuild.config.js', 'esbuild.config.mjs',
  'turbo.json',
  'nx.json',
  'lerna.json',
  '.babelrc', 'babel.config.js', 'babel.config.json',
  'tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.mjs',
  'postcss.config.js', 'postcss.config.cjs',
  'jest.config.js', 'jest.config.ts', 'jest.config.json',
  'vitest.config.ts', 'vitest.config.js',
  '.env', '.env.example', '.env.local',
  'docker-compose.yml', 'docker-compose.yaml', 'Dockerfile',
  'Makefile',
  '.github/workflows',
  'vercel.json', 'netlify.toml',
  'electron-builder.yml', 'electron-builder.json5',
  'pyproject.toml', 'setup.py', 'setup.cfg',
  'Cargo.toml',
  'go.mod',
  'Gemfile',
  '.gitignore',
]

// ─── Scanner ────────────────────────────────────────────────────────────────

async function scanProject(projectRoot: string): Promise<ProjectContext> {
  const context: ProjectContext = {
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
  }

  // Check for CLAUDE.md
  context.hasClaudeMd = await fileExists(path.join(projectRoot, 'CLAUDE.md'))

  // Read top-level directory entries
  let topEntries: string[] = []
  try {
    topEntries = await fs.readdir(projectRoot)
  } catch {
    return context
  }

  // Detect key directories
  for (const entry of topEntries) {
    const fullPath = path.join(projectRoot, entry)
    try {
      const stat = await fs.stat(fullPath)
      if (stat.isDirectory()) {
        const purpose = DIR_PURPOSES[entry]
        if (purpose) {
          context.keyDirs.push({ path: entry, purpose })
        }
      }
    } catch {
      // skip inaccessible entries
    }
  }

  // Detect config files
  for (const configFile of CONFIG_FILES) {
    if (await fileExists(path.join(projectRoot, configFile))) {
      context.keyConfigs.push(configFile)
    }
  }

  // ── Node.js / JavaScript / TypeScript ─────────────────────────────────────
  const pkgJson = await readJsonSafe(path.join(projectRoot, 'package.json'))
  if (pkgJson) {
    const allDeps: Record<string, string> = {
      ...(pkgJson.dependencies as Record<string, string> | undefined ?? {}),
      ...(pkgJson.devDependencies as Record<string, string> | undefined ?? {}),
    }

    // Package manager detection
    if (await fileExists(path.join(projectRoot, 'bun.lockb')) || await fileExists(path.join(projectRoot, 'bun.lock'))) {
      context.packageManager = 'bun'
    } else if (await fileExists(path.join(projectRoot, 'pnpm-lock.yaml'))) {
      context.packageManager = 'pnpm'
    } else if (await fileExists(path.join(projectRoot, 'yarn.lock'))) {
      context.packageManager = 'yarn'
    } else {
      context.packageManager = 'npm'
    }

    // Language detection
    if (allDeps['typescript'] || context.keyConfigs.includes('tsconfig.json')) {
      context.language = 'TypeScript'
    } else {
      context.language = 'JavaScript'
    }

    // Framework detection (order matters — more specific first)
    for (const [, sig] of Object.entries(FRAMEWORK_SIGNATURES)) {
      if (sig.deps.some((d) => d in allDeps)) {
        // Prefer the most specific match
        if (!context.framework || sig.label.length > context.framework.length) {
          context.framework = sig.label
        }
      }
    }

    // For Next.js / Nuxt / Remix / SvelteKit — prioritize over generic React/Vue
    for (const key of ['next', 'nuxt', 'remix', 'sveltekit', 'astro', 'gatsby']) {
      const sig = FRAMEWORK_SIGNATURES[key]
      if (sig.deps.some((d) => d in allDeps)) {
        context.framework = sig.label
        break
      }
    }

    // Test framework detection
    for (const [name, deps] of Object.entries(TEST_FRAMEWORKS)) {
      if (deps.length > 0 && deps.some((d) => d in allDeps)) {
        context.testFramework = name
        break
      }
    }

    // Build commands from scripts
    const scripts = pkgJson.scripts as Record<string, string> | undefined
    if (scripts) {
      const interestingScripts = ['dev', 'start', 'build', 'test', 'lint', 'format', 'typecheck', 'check', 'preview', 'deploy']
      for (const name of interestingScripts) {
        if (scripts[name]) {
          context.buildCommands.push({
            name: `${context.packageManager ?? 'npm'} run ${name}`,
            command: scripts[name],
          })
        }
      }
    }

    // Entry points from package.json
    if (typeof pkgJson.main === 'string') {
      context.entryPoints.push(pkgJson.main as string)
    }

    // Dependencies (top-level only, limit to key ones)
    const deps = pkgJson.dependencies as Record<string, string> | undefined
    if (deps) {
      for (const [name, version] of Object.entries(deps)) {
        context.dependencies.push({ name, version })
      }
    }

    // Detected patterns
    if (allDeps['typescript']) {
      // Check tsconfig for strict mode
      const tsconfig = await readJsonSafe(path.join(projectRoot, 'tsconfig.json'))
      if (tsconfig) {
        const compilerOptions = tsconfig.compilerOptions as Record<string, unknown> | undefined
        if (compilerOptions?.strict === true) {
          context.detectedPatterns.push('TypeScript strict mode')
        }
        if (compilerOptions?.module === 'esnext' || compilerOptions?.module === 'es2020' || compilerOptions?.module === 'es2022' || compilerOptions?.module === 'nodenext' || compilerOptions?.module === 'node16') {
          context.detectedPatterns.push('ESM modules')
        }
      }
    }

    if (pkgJson.type === 'module') {
      if (!context.detectedPatterns.includes('ESM modules')) {
        context.detectedPatterns.push('ESM modules')
      }
    }

    if (pkgJson.workspaces || await fileExists(path.join(projectRoot, 'pnpm-workspace.yaml')) || await fileExists(path.join(projectRoot, 'lerna.json')) || await fileExists(path.join(projectRoot, 'turbo.json')) || await fileExists(path.join(projectRoot, 'nx.json'))) {
      context.detectedPatterns.push('Monorepo')
    }

    if (allDeps['tailwindcss']) context.detectedPatterns.push('Tailwind CSS')
    if (allDeps['prisma'] || allDeps['@prisma/client']) context.detectedPatterns.push('Prisma ORM')
    if (allDeps['drizzle-orm']) context.detectedPatterns.push('Drizzle ORM')
    if (allDeps['trpc'] || allDeps['@trpc/server']) context.detectedPatterns.push('tRPC')
    if (allDeps['graphql'] || allDeps['@apollo/client'] || allDeps['@graphql-tools/schema']) context.detectedPatterns.push('GraphQL')
    if (allDeps['docker-compose'] || context.keyConfigs.some((c) => c.startsWith('docker'))) context.detectedPatterns.push('Docker')
    if (allDeps['electron']) context.detectedPatterns.push('Electron app')
  }

  // ── Rust (Cargo.toml) ─────────────────────────────────────────────────────
  if (!pkgJson && await fileExists(path.join(projectRoot, 'Cargo.toml'))) {
    context.language = 'Rust'
    context.packageManager = 'cargo'
    context.testFramework = 'cargo test'
    context.buildCommands.push(
      { name: 'cargo build', command: 'cargo build' },
      { name: 'cargo test', command: 'cargo test' },
      { name: 'cargo run', command: 'cargo run' },
    )

    const cargoContent = await readTextSafe(path.join(projectRoot, 'Cargo.toml'))
    if (cargoContent) {
      // Detect workspace
      if (cargoContent.includes('[workspace]')) {
        context.detectedPatterns.push('Cargo workspace')
      }
      // Extract name
      const nameMatch = cargoContent.match(/^name\s*=\s*"([^"]+)"/m)
      if (nameMatch) context.name = nameMatch[1]
    }

    // Detect common entry points
    if (await fileExists(path.join(projectRoot, 'src', 'main.rs'))) {
      context.entryPoints.push('src/main.rs')
    }
    if (await fileExists(path.join(projectRoot, 'src', 'lib.rs'))) {
      context.entryPoints.push('src/lib.rs')
    }
  }

  // ── Python (pyproject.toml / setup.py) ────────────────────────────────────
  if (!pkgJson && (await fileExists(path.join(projectRoot, 'pyproject.toml')) || await fileExists(path.join(projectRoot, 'setup.py')))) {
    context.language = 'Python'
    context.packageManager = 'pip'

    // Check for common frameworks from requirements or pyproject
    const reqContent = await readTextSafe(path.join(projectRoot, 'requirements.txt'))
    const pyprojectContent = await readTextSafe(path.join(projectRoot, 'pyproject.toml'))
    const combined = (reqContent ?? '') + (pyprojectContent ?? '')

    if (/django/i.test(combined)) context.framework = 'Django'
    else if (/fastapi/i.test(combined)) context.framework = 'FastAPI'
    else if (/flask/i.test(combined)) context.framework = 'Flask'

    if (/pytest/i.test(combined)) context.testFramework = 'pytest'

    // Entry points
    for (const entry of ['app.py', 'main.py', 'manage.py', 'wsgi.py', 'asgi.py']) {
      if (await fileExists(path.join(projectRoot, entry))) {
        context.entryPoints.push(entry)
      }
    }

    context.buildCommands.push(
      { name: 'pip install', command: 'pip install -e .' },
    )
    if (context.testFramework === 'pytest') {
      context.buildCommands.push({ name: 'pytest', command: 'pytest' })
    }

    if (await fileExists(path.join(projectRoot, 'poetry.lock'))) {
      context.detectedPatterns.push('Poetry')
    }
    if (await fileExists(path.join(projectRoot, 'uv.lock'))) {
      context.detectedPatterns.push('uv package manager')
    }
  }

  // ── Go (go.mod) ───────────────────────────────────────────────────────────
  if (!pkgJson && await fileExists(path.join(projectRoot, 'go.mod'))) {
    context.language = 'Go'
    context.packageManager = 'go'
    context.testFramework = 'go test'
    context.buildCommands.push(
      { name: 'go build', command: 'go build ./...' },
      { name: 'go test', command: 'go test ./...' },
      { name: 'go run', command: 'go run .' },
    )

    if (await fileExists(path.join(projectRoot, 'main.go'))) {
      context.entryPoints.push('main.go')
    }
    if (await fileExists(path.join(projectRoot, 'cmd'))) {
      context.entryPoints.push('cmd/')
    }
  }

  // ── Ruby (Gemfile) ────────────────────────────────────────────────────────
  if (!pkgJson && await fileExists(path.join(projectRoot, 'Gemfile'))) {
    context.language = 'Ruby'
    const gemContent = await readTextSafe(path.join(projectRoot, 'Gemfile'))
    if (gemContent && /rails/i.test(gemContent)) {
      context.framework = 'Ruby on Rails'
    }
    context.testFramework = 'rspec'
    context.buildCommands.push(
      { name: 'bundle install', command: 'bundle install' },
    )
  }

  // Detect common entry points for JS/TS projects
  if (pkgJson && context.entryPoints.length === 0) {
    const candidates = [
      'src/main.ts', 'src/main.tsx', 'src/index.ts', 'src/index.tsx',
      'src/main.js', 'src/index.js', 'src/app.ts', 'src/app.tsx',
      'src/app.js', 'index.ts', 'index.js', 'server.ts', 'server.js',
    ]
    for (const candidate of candidates) {
      if (await fileExists(path.join(projectRoot, candidate))) {
        context.entryPoints.push(candidate)
      }
    }
  }

  // Detect Makefile-based builds
  if (await fileExists(path.join(projectRoot, 'Makefile'))) {
    context.detectedPatterns.push('Makefile build')
  }

  // Detect CI
  if (await fileExists(path.join(projectRoot, '.github', 'workflows'))) {
    context.detectedPatterns.push('GitHub Actions CI')
  }

  // Detect git
  if (await fileExists(path.join(projectRoot, '.git'))) {
    context.detectedPatterns.push('Git repository')
  }

  return context
}

// ─── Generator ──────────────────────────────────────────────────────────────

function generateClaudeMdContent(context: ProjectContext, options: ContextGenerateOptions = {}): string {
  const { includeCommands = true, includeDeps = true, includeStructure = true, maxDeps = 20 } = options
  const lines: string[] = []

  // Header
  lines.push(`# ${context.name}`)
  lines.push('')

  // What This Is
  lines.push('## What This Is')
  const parts: string[] = []
  if (context.framework) parts.push(`${context.framework} project`)
  else parts.push(`${context.language} project`)
  if (context.detectedPatterns.length > 0) {
    parts.push(`using ${context.detectedPatterns.slice(0, 5).join(', ')}`)
  }
  lines.push(parts.join(' ') + '.')
  lines.push('')

  // Commands
  if (includeCommands && context.buildCommands.length > 0) {
    lines.push('## Commands')
    for (const cmd of context.buildCommands) {
      lines.push(`- \`${cmd.name}\` — ${cmd.command}`)
    }
    lines.push('')
  }

  // Tech Stack
  const stack: string[] = []
  stack.push(`Language: ${context.language}`)
  if (context.framework) stack.push(`Framework: ${context.framework}`)
  if (context.packageManager) stack.push(`Package Manager: ${context.packageManager}`)
  if (context.testFramework) stack.push(`Test Framework: ${context.testFramework}`)

  lines.push('## Tech Stack')
  for (const item of stack) {
    lines.push(`- ${item}`)
  }
  lines.push('')

  // Key Files
  if (context.entryPoints.length > 0) {
    lines.push('## Key Files')
    lines.push('')
    lines.push('| File | Role |')
    lines.push('|---|---|')
    for (const entry of context.entryPoints) {
      lines.push(`| \`${entry}\` | Entry point |`)
    }
    lines.push('')
  }

  // Project Structure
  if (includeStructure && context.keyDirs.length > 0) {
    lines.push('## Project Structure')
    lines.push('')
    lines.push('| Path | Contents |')
    lines.push('|---|---|')
    for (const dir of context.keyDirs.filter((d) => d.path !== 'node_modules' && d.path !== 'dist' && d.path !== 'build' && d.path !== 'out')) {
      lines.push(`| \`${dir.path}/\` | ${dir.purpose} |`)
    }
    lines.push('')
  }

  // Config Files
  if (context.keyConfigs.length > 0) {
    const relevantConfigs = context.keyConfigs.filter((c) => !c.startsWith('.env'))
    if (relevantConfigs.length > 0) {
      lines.push('## Configuration')
      lines.push(`Key config files: ${relevantConfigs.map((c) => `\`${c}\``).join(', ')}`)
      lines.push('')
    }
  }

  // Detected Patterns / Conventions
  if (context.detectedPatterns.length > 0) {
    lines.push('## Conventions')
    for (const pattern of context.detectedPatterns) {
      lines.push(`- ${pattern}`)
    }
    lines.push('')
  }

  // Dependencies (optional, truncated)
  if (includeDeps && context.dependencies.length > 0) {
    lines.push('## Key Dependencies')
    const deps = context.dependencies.slice(0, maxDeps)
    for (const dep of deps) {
      lines.push(`- \`${dep.name}\`: ${dep.version}`)
    }
    if (context.dependencies.length > maxDeps) {
      lines.push(`- ... and ${context.dependencies.length - maxDeps} more`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ─── IPC Registration ──────────────────────────────────────────────────────

export function registerContextHandlers(_senderWindow: SenderWindow): string[] {
  const channels: string[] = []

  ipcMain.handle('context:scan', async (_event, projectRoot: string) => {
    try {
      const context = await scanProject(projectRoot)
      return { success: true, context }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('context:scan')

  ipcMain.handle('context:generate', async (_event, projectRoot: string, options?: ContextGenerateOptions) => {
    try {
      const context = await scanProject(projectRoot)
      const content = generateClaudeMdContent(context, options ?? {})
      return { success: true, content, context }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  channels.push('context:generate')

  return channels
}
