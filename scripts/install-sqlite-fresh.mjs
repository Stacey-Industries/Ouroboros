// Idempotent installer for the system-Node build of better-sqlite3.
// vitest aliases better-sqlite3 to this directory because the project's
// native addon is compiled for Electron's ABI, not system Node's ABI.
// CI installs this automatically; this script handles local dev machines.

import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { spawnSync } from 'child_process'

const baseDir = process.env.LOCALAPPDATA ?? '/tmp'
const targetDir = join(baseDir, 'Temp', 'sqlite-fresh')
const addonPath = join(targetDir, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')

if (existsSync(addonPath)) {
  // Already installed — nothing to do.
  process.exit(0)
}

process.stdout.write('[sqlite-fresh] Installing better-sqlite3 for system Node (vitest ABI fix)...\n')

mkdirSync(targetDir, { recursive: true })

const pkgJson = JSON.stringify({ name: 'sqlite-fresh', private: true }, null, 2)
writeFileSync(join(targetDir, 'package.json'), pkgJson)

const result = spawnSync('npm', ['install', 'better-sqlite3'], {
  cwd: targetDir,
  stdio: 'inherit',
  shell: true,
})

if (result.status !== 0) {
  process.stderr.write(
    `[sqlite-fresh] ERROR: npm install better-sqlite3 failed (exit ${result.status ?? 'null'}).\n` +
    `  Target directory: ${targetDir}\n` +
    '  Ensure npm is on PATH and you have network access.\n',
  )
  process.exit(result.status ?? 1)
}

process.stdout.write('[sqlite-fresh] Installation complete.\n')
