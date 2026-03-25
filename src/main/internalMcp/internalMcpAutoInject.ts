import fs from 'fs/promises'
import path from 'path'

// ---------------------------------------------------------------------------
// Path helper
// ---------------------------------------------------------------------------

function settingsPath(projectRoot: string): string {
  return path.join(projectRoot, '.claude', 'settings.json')
}

// ---------------------------------------------------------------------------
// Atomic write helper
// ---------------------------------------------------------------------------

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const tmpPath = `${filePath}.tmp`
  const content = JSON.stringify(data, null, 2)
  await fs.writeFile(tmpPath, content, 'utf-8')
  try {
    await fs.rename(tmpPath, filePath)
  } catch (renameErr) {
    // Best effort: clean up .tmp file
    try { await fs.unlink(tmpPath) } catch { /* ignore */ }
    throw renameErr
  }
}

// ---------------------------------------------------------------------------
// Read settings file — returns null if file invalid JSON (do not overwrite)
// ---------------------------------------------------------------------------

type SettingsRecord = Record<string, unknown>
type ServerMap = Record<string, { url?: string; command?: string; args?: string[]; env?: Record<string, string> }>

async function readSettings(filePath: string): Promise<SettingsRecord | null> {
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf-8')
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      // File does not exist — treat as empty object
      return {}
    }
    throw err
  }

  // File exists — try to parse
  try {
    return JSON.parse(raw) as SettingsRecord
  } catch {
    console.warn('[internal-mcp] .claude/settings.json exists but is not valid JSON — not overwriting')
    throw new Error('.claude/settings.json exists but contains invalid JSON')
  }
}

// ---------------------------------------------------------------------------
// injectIntoProjectSettings
// ---------------------------------------------------------------------------

export async function injectIntoProjectSettings(
  projectRoot: string,
  serverPort: number,
): Promise<void> {
  const filePath = settingsPath(projectRoot)

  // Ensure the .claude/ directory exists
  await fs.mkdir(path.dirname(filePath), { recursive: true })

  const settings = await readSettings(filePath)
  if (settings === null) {
    // Should not happen given the logic above, but guard anyway
    throw new Error('Could not read settings file')
  }

  // Upsert mcpServers.ouroboros — use 127.0.0.1 explicitly (not localhost)
  const mcpServers = ((settings.mcpServers as ServerMap | undefined) ?? {}) as ServerMap
  mcpServers['ouroboros'] = { url: `http://127.0.0.1:${serverPort}/sse` }

  // Remove external codebase-memory-mcp if present (now redundant)
  delete mcpServers['codebase-memory-mcp']
  delete mcpServers['codebase-memory']

  // Also clean from disabled servers
  const disabledMcp = ((settings.disabledMcpServers as ServerMap | undefined) ?? {}) as ServerMap
  delete disabledMcp['codebase-memory-mcp']
  delete disabledMcp['codebase-memory']
  if (Object.keys(disabledMcp).length > 0) {
    settings.disabledMcpServers = disabledMcp
  } else {
    delete settings.disabledMcpServers
  }

  settings.mcpServers = mcpServers

  await atomicWriteJson(filePath, settings)
}

// ---------------------------------------------------------------------------
// removeFromProjectSettings
// ---------------------------------------------------------------------------

export async function removeFromProjectSettings(projectRoot: string): Promise<void> {
  const filePath = settingsPath(projectRoot)

  let settings: SettingsRecord
  try {
    const result = await readSettings(filePath)
    if (result === null) return  // Invalid JSON — don't touch
    settings = result
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return  // File doesn't exist — nothing to do
    // If the file is invalid JSON, readSettings throws without ENOENT code
    // Log the warning but don't fail the caller
    console.warn('[internal-mcp] removeFromProjectSettings: could not read settings file:', err)
    return
  }

  // Remove ouroboros from mcpServers
  const mcpServers = (settings.mcpServers ?? {}) as ServerMap
  if ('ouroboros' in mcpServers) {
    delete mcpServers['ouroboros']
  }

  // Clean up empty mcpServers object
  if (Object.keys(mcpServers).length === 0) {
    delete settings.mcpServers
  } else {
    settings.mcpServers = mcpServers
  }

  // Remove ouroboros from disabledMcpServers if present
  const disabledServers = (settings.disabledMcpServers ?? {}) as ServerMap
  if ('ouroboros' in disabledServers) {
    delete disabledServers['ouroboros']
    if (Object.keys(disabledServers).length === 0) {
      delete settings.disabledMcpServers
    } else {
      settings.disabledMcpServers = disabledServers
    }
  }

  await atomicWriteJson(filePath, settings)
}
