import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import log from '../logger';

// ---------------------------------------------------------------------------
// Wave 53g: Claude Code reads MCP server config from `.mcp.json` at project
// root, NOT from `.claude/settings.json`. Pre-53g this file wrote to
// `.claude/settings.json mcpServers`, which Claude Code CLI silently ignored.
// The current behavior:
//
//   1. Write `<projectRoot>/.mcp.json` with `{mcpServers: {ouroboros: {...}}}`.
//   2. Update `~/.claude.json` per-project entry's `enabledMcpjsonServers`
//      array to include `ouroboros` so Claude Code auto-loads it without
//      the trust dialog (assuming the project is already trusted).
//   3. Cleanup: remove the orphaned `mcpServers.ouroboros` entry from
//      `.claude/settings.json` if it's there from earlier wave attempts.
//
// Atomic write throughout (`.tmp` + rename). Reads are tolerant of missing
// files (treated as empty objects); writes are only attempted when the
// underlying file is parseable JSON or absent.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function mcpJsonPath(projectRoot: string): string {
  return path.join(projectRoot, '.mcp.json');
}

function settingsPath(projectRoot: string): string {
  return path.join(projectRoot, '.claude', 'settings.json');
}

function userClaudeJsonPath(): string {
  return path.join(os.homedir(), '.claude.json');
}

// ---------------------------------------------------------------------------
// Atomic write helper
// ---------------------------------------------------------------------------

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  const content = JSON.stringify(data, null, 2);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from validated projectRoot/homedir + known filename
  await fs.writeFile(tmpPath, content, 'utf-8');
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from validated projectRoot/homedir + known filename
    await fs.rename(tmpPath, filePath);
  } catch (renameErr) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- cleanup of tmp file at the same validated path
      await fs.unlink(tmpPath);
    } catch {
      /* ignore */
    }
    throw renameErr;
  }
}

// ---------------------------------------------------------------------------
// Tolerant JSON read — returns null if invalid, {} if absent
// ---------------------------------------------------------------------------

type JsonRecord = Record<string, unknown>;
type ServerEntry = {
  /** Wave 53h: required by Claude Code's `.mcp.json` schema validator.
   *  Without `type`, the entry is rejected at parse time with
   *  "Does not adhere to MCP server configuration schema". */
  type?: 'sse' | 'http' | 'stdio';
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
};
type ServerMap = Record<string, ServerEntry>;

async function readJsonTolerant(
  filePath: string,
  label: string,
): Promise<JsonRecord | null> {
  let raw: string;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is one of three known constants
    raw = await fs.readFile(filePath, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
  try {
    return JSON.parse(raw) as JsonRecord;
  } catch {
    log.warn(`[internal-mcp] ${label} exists but is not valid JSON — not overwriting`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Ouroboros entry builder (Wave 60 Phase E)
//
// Single shape now: spawn the standalone (`out/main/ouroborosMcp.js`) via
// the IDE's Electron binary in Node mode. Reads the SQLite DB directly,
// works whether the IDE is running or not. Pre-Wave-60's transport
// branching (sse vs stdio bridge) is gone.
//
// Electron-as-Node is required because better-sqlite3's native binding
// is compiled for Electron's Node ABI (145); system Node (ABI 137) fails
// module-load. ELECTRON_RUN_AS_NODE=1 sidesteps the mismatch and the IDE
// installer ships the binary, so it's always on disk.
// ---------------------------------------------------------------------------

export interface InjectOptions {
  /**
   * Absolute path to the standalone MCP script (`ouroborosMcp.js`).
   * `buildInjectOptions` resolves this from the IDE's main-out directory.
   */
  standaloneScriptPath?: string;
  /** @deprecated Use `standaloneScriptPath`. Kept for back-compat with callers
   *  that haven't been updated yet — falls back to this field if `standaloneScriptPath`
   *  is absent. Removed in a future wave. */
  stdioTransportPath?: string;
}

function buildOuroborosEntry(_serverPort: number, opts: InjectOptions): ServerEntry {
  const scriptPath = opts.standaloneScriptPath ?? opts.stdioTransportPath;
  if (!scriptPath) {
    throw new Error('ouroboros injection requires standaloneScriptPath');
  }
  return {
    type: 'stdio',
    command: process.execPath,
    args: [scriptPath],
    env: { ELECTRON_RUN_AS_NODE: '1' },
  };
}

// ---------------------------------------------------------------------------
// Step 1 — write .mcp.json at project root
// ---------------------------------------------------------------------------

async function writeMcpJson(projectRoot: string, entry: ServerEntry): Promise<void> {
  const filePath = mcpJsonPath(projectRoot);
  const existing = await readJsonTolerant(filePath, '.mcp.json');
  if (existing === null) return; // Don't overwrite invalid JSON
  const mcpServers = ((existing.mcpServers as ServerMap | undefined) ?? {}) as ServerMap;
  mcpServers['ouroboros'] = entry;
  existing.mcpServers = mcpServers;
  await atomicWriteJson(filePath, existing);
}

// ---------------------------------------------------------------------------
// Step 2 — update ~/.claude.json per-project enabledMcpjsonServers
// ---------------------------------------------------------------------------

interface ClaudeProjectEntry {
  enabledMcpjsonServers?: string[];
  disabledMcpjsonServers?: string[];
  [k: string]: unknown;
}

function ensureProjectEntry(
  projects: Record<string, ClaudeProjectEntry>,
  key: string,
): ClaudeProjectEntry {
  // eslint-disable-next-line security/detect-object-injection -- key is a normalized projectRoot, not user input
  const existing = projects[key];
  if (existing && typeof existing === 'object') return existing;
  const fresh: ClaudeProjectEntry = {};
  // eslint-disable-next-line security/detect-object-injection -- key is a normalized projectRoot, not user input
  projects[key] = fresh;
  return fresh;
}

async function enableInClaudeJson(projectRoot: string): Promise<void> {
  const filePath = userClaudeJsonPath();
  const claudeJson = await readJsonTolerant(filePath, '~/.claude.json');
  if (claudeJson === null) return; // Don't touch invalid JSON
  const projects =
    ((claudeJson.projects as Record<string, ClaudeProjectEntry> | undefined) ?? {});
  const projectKey = path.normalize(projectRoot);
  const entry = ensureProjectEntry(projects, projectKey);

  const enabled = Array.isArray(entry.enabledMcpjsonServers)
    ? [...entry.enabledMcpjsonServers]
    : [];
  if (!enabled.includes('ouroboros')) {
    enabled.push('ouroboros');
  }
  entry.enabledMcpjsonServers = enabled;

  // If `ouroboros` was previously disabled, undisable it.
  const disabled = Array.isArray(entry.disabledMcpjsonServers)
    ? entry.disabledMcpjsonServers.filter((s) => s !== 'ouroboros')
    : [];
  if (disabled.length > 0) {
    entry.disabledMcpjsonServers = disabled;
  } else {
    delete entry.disabledMcpjsonServers;
  }

  claudeJson.projects = projects;
  await atomicWriteJson(filePath, claudeJson);
}

// ---------------------------------------------------------------------------
// Step 3 — clean up the orphaned entry in .claude/settings.json
// ---------------------------------------------------------------------------

async function cleanupLegacySettingsJson(projectRoot: string): Promise<void> {
  const filePath = settingsPath(projectRoot);
  const settings = await readJsonTolerant(filePath, '.claude/settings.json');
  if (settings === null) return; // Don't touch invalid JSON
  const mcpServers = settings.mcpServers as ServerMap | undefined;
  if (!mcpServers || !('ouroboros' in mcpServers)) {
    return; // Nothing to clean up; do not write (avoid no-op churn)
  }
  delete mcpServers['ouroboros'];
  if (Object.keys(mcpServers).length === 0) {
    delete settings.mcpServers;
  } else {
    settings.mcpServers = mcpServers;
  }
  await atomicWriteJson(filePath, settings);
}

// ---------------------------------------------------------------------------
// Public API: injectIntoProjectSettings
// ---------------------------------------------------------------------------

/**
 * Register the standalone MCP server (`ouroboros`) for Claude Code
 * discovery in this project. Three actions, in order:
 *
 *   1. Write `<projectRoot>/.mcp.json` with the standalone `ouroboros`
 *      entry.
 *   2. Update `~/.claude.json` projects.<root>.enabledMcpjsonServers to
 *      include `'ouroboros'`.
 *   3. Clean up any orphaned `mcpServers.ouroboros` entry from
 *      `.claude/settings.json` (where pre-53g writes landed but Claude Code
 *      never read).
 *
 * All steps are idempotent and atomic. Tolerant of missing/invalid files —
 * never throws on parse errors, never partial-writes via .tmp + rename.
 *
 * Wired into `main.ts` during startup so the user-level MCP registration is
 * refreshed every IDE launch.
 */
export async function injectIntoProjectSettings(
  projectRoot: string,
  serverPort: number,
  options: InjectOptions = {},
): Promise<void> {
  const entry = buildOuroborosEntry(serverPort, options);

  // .mcp.json gets written at the project root, alongside .claude/.
  // Ensure the project root exists (it should — main.ts uses defaultProjectRoot
  // which is validated upstream — but mkdir is idempotent and cheap).
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- projectRoot is upstream-validated
  await fs.mkdir(projectRoot, { recursive: true });

  await writeMcpJson(projectRoot, entry);
  await enableInClaudeJson(projectRoot);
  await cleanupLegacySettingsJson(projectRoot);
}

// ---------------------------------------------------------------------------
// Public API: removeFromProjectSettings
// ---------------------------------------------------------------------------

/**
 * Remove the `ouroboros` MCP server registration. Mirrors the three writes
 * of `injectIntoProjectSettings` in reverse: delete from `.mcp.json`, remove
 * from `~/.claude.json` enabledMcpjsonServers, and clear any legacy entry
 * from `.claude/settings.json`.
 *
 * The standalone entry is rewritten on the next IDE startup, so manual
 * callers mainly use this for disable/reset flows.
 */
export async function removeFromProjectSettings(projectRoot: string): Promise<void> {
  await removeFromMcpJson(projectRoot);
  await disableInClaudeJson(projectRoot);
  await cleanupLegacySettingsJson(projectRoot);
}

async function removeFromMcpJson(projectRoot: string): Promise<void> {
  const filePath = mcpJsonPath(projectRoot);
  const existing = await readJsonTolerant(filePath, '.mcp.json');
  if (existing === null) return;
  const mcpServers = existing.mcpServers as ServerMap | undefined;
  if (!mcpServers || !('ouroboros' in mcpServers)) return;
  delete mcpServers['ouroboros'];
  if (Object.keys(mcpServers).length === 0) {
    delete existing.mcpServers;
  } else {
    existing.mcpServers = mcpServers;
  }
  await atomicWriteJson(filePath, existing);
}

async function disableInClaudeJson(projectRoot: string): Promise<void> {
  const filePath = userClaudeJsonPath();
  const claudeJson = await readJsonTolerant(filePath, '~/.claude.json');
  if (claudeJson === null) return;
  const projects = claudeJson.projects as Record<string, ClaudeProjectEntry> | undefined;
  if (!projects) return;
  const projectKey = path.normalize(projectRoot);
  // eslint-disable-next-line security/detect-object-injection -- key is a normalized projectRoot
  const entry = projects[projectKey];
  if (!entry) return;
  if (Array.isArray(entry.enabledMcpjsonServers)) {
    const filtered = entry.enabledMcpjsonServers.filter((s) => s !== 'ouroboros');
    if (filtered.length > 0) {
      entry.enabledMcpjsonServers = filtered;
    } else {
      delete entry.enabledMcpjsonServers;
    }
  }
  await atomicWriteJson(filePath, claudeJson);
}
