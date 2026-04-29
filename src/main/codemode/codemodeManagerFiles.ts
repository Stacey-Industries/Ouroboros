/**
 * codemodeManagerFiles.ts — File paths, atomic JSON I/O, restoration record.
 *
 * Wave 53k: extracted from codemodeManager to keep that file under the
 * 300-line ESLint limit. CodeMode owns three files:
 *   - `~/.claude.json` (Claude Code's user config — we add/remove
 *     `mcpServers.__codemode_proxy` and toggle project flags here).
 *   - `<projectRoot>/.mcp.json` (Claude Code's per-project MCP config —
 *     read-only from this module; the canonical entry stays put while
 *     CodeMode is active).
 *   - `~/.claude/codemode-managed.json` (private restoration record;
 *     written by us, never read by Claude Code).
 */

import { existsSync } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import log from '../logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface McpServerConfig {
  type?: 'sse' | 'http' | 'stdio';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  /**
   * Wave 53l Phase A polish: when true, Claude Code's tool-search harness
   * skips deferral for this server's tools and loads them at session start.
   * We set this on `__codemode_proxy` so the agent doesn't have to issue a
   * `ToolSearch` round-trip before its first `execute_code` call.
   */
  alwaysLoad?: boolean;
}

export interface ClaudeProjectEntry {
  enabledMcpjsonServers?: string[];
  disabledMcpjsonServers?: string[];
  [k: string]: unknown;
}

export interface ManagedRestorationFile {
  version: 2;
  global: Record<string, McpServerConfig>;
  /**
   * Project-scope backup. Keyed by project root, value is the
   * `<root>/.mcp.json mcpServers` subset we removed during enable.
   * Wave 53k Phase B″ revised this from `Record<string, string[]>` (names
   * only, paired with a flag toggle) to `Record<string, Record<name, config>>`
   * — the toggle-based disable was empirically non-functional on
   * Claude Code v2.1.122 Windows, so we now remove entries from `.mcp.json`
   * and resurrect them verbatim on disable.
   */
  project: Record<string, Record<string, McpServerConfig>>;
  proxiedNames: string[];
  activeProjectRoot?: string;
}

export type JsonRecord = Record<string, unknown>;

// ─── File paths ───────────────────────────────────────────────────────────────

export function userClaudeJsonPath(): string {
  return path.join(os.homedir(), '.claude.json');
}

export function projectMcpJsonPath(projectRoot: string): string {
  return path.join(projectRoot, '.mcp.json');
}

export function restorationFilePath(): string {
  return path.join(os.homedir(), '.claude', 'codemode-managed.json');
}

export const PROXY_CONFIG_PATH = path.join(os.tmpdir(), 'codemode-proxy-config.json');

// ─── Atomic JSON I/O ──────────────────────────────────────────────────────────

export async function readJsonTolerant(
  filePath: string,
  label: string,
): Promise<JsonRecord | null> {
  let raw: string;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath from known helpers
    raw = await fs.readFile(filePath, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
  try {
    return JSON.parse(raw) as JsonRecord;
  } catch {
    log.warn(`[codemode] ${label} exists but is not valid JSON — not overwriting`);
    return null;
  }
}

export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir from known target
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- tmp alongside known target
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- atomic rename
    await fs.rename(tmp, filePath);
  } catch (renameErr) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- cleanup
      await fs.unlink(tmp);
    } catch {
      /* ignore */
    }
    throw renameErr;
  }
}

// ─── Server / project map extraction ──────────────────────────────────────────

export function getServerMap(json: JsonRecord | null): Record<string, McpServerConfig> {
  if (!json) return {};
  const servers = json.mcpServers;
  if (!servers || typeof servers !== 'object') return {};
  return servers as Record<string, McpServerConfig>;
}

export function getProjectsMap(json: JsonRecord | null): Record<string, ClaudeProjectEntry> {
  if (!json) return {};
  const projects = json.projects;
  if (!projects || typeof projects !== 'object') return {};
  return projects as Record<string, ClaudeProjectEntry>;
}

export function getProjectEntry(
  projects: Record<string, ClaudeProjectEntry>,
  projectRoot: string,
): ClaudeProjectEntry | undefined {
  const key = path.normalize(projectRoot);
  // eslint-disable-next-line security/detect-object-injection -- key is normalized path
  return projects[key];
}

export function ensureProjectEntry(
  projects: Record<string, ClaudeProjectEntry>,
  projectRoot: string,
): ClaudeProjectEntry {
  const key = path.normalize(projectRoot);
  // eslint-disable-next-line security/detect-object-injection -- key is normalized path
  const existing = projects[key];
  if (existing && typeof existing === 'object') return existing;
  const fresh: ClaudeProjectEntry = {};
  // eslint-disable-next-line security/detect-object-injection -- key is normalized path
  projects[key] = fresh;
  return fresh;
}

export function isProjectServerEnabled(
  name: string,
  entry: ClaudeProjectEntry | undefined,
): boolean {
  const disabled = Array.isArray(entry?.disabledMcpjsonServers)
    ? entry!.disabledMcpjsonServers
    : [];
  if (disabled.includes(name)) return false;
  const enabled = Array.isArray(entry?.enabledMcpjsonServers) ? entry!.enabledMcpjsonServers : null;
  if (enabled === null) return true;
  return enabled.includes(name);
}

// ─── Restoration file I/O ─────────────────────────────────────────────────────

export async function readRestorationFile(): Promise<ManagedRestorationFile | null> {
  const data = await readJsonTolerant(restorationFilePath(), 'codemode-managed.json');
  if (!data || typeof data !== 'object') return null;
  if ((data as { version?: number }).version !== 2) return null;
  return data as unknown as ManagedRestorationFile;
}

export async function writeRestorationFile(record: ManagedRestorationFile): Promise<void> {
  await atomicWriteJson(restorationFilePath(), record);
}

export async function deleteRestorationFile(): Promise<void> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- module-local known path
    await fs.unlink(restorationFilePath());
  } catch {
    /* non-fatal */
  }
}

// ─── Proxy entry builder ──────────────────────────────────────────────────────

/**
 * Resolve the runtime path of `proxyServer.js`. Wave 53k Phase B″ bug:
 * electron-vite bundles `codemodeManagerFiles` into `out/main/chunks/<x>.js`,
 * so `__dirname` at runtime is `out/main/chunks/`. But `proxyServer.ts` is a
 * top-level rollup input (per `electron.vite.config.ts`) that builds to
 * `out/main/proxyServer.js`. The naive `path.join(__dirname, 'proxyServer.js')`
 * pointed at a non-existent `out/main/chunks/proxyServer.js`, causing Claude
 * Code's spawn of `__codemode_proxy` to fail silently — no tools surfaced.
 *
 * Resolution: check both layouts (sibling, then parent) and use whichever
 * actually exists. Falls back to the sibling path so the error message (when
 * Claude Code attempts to spawn) names a real configured location.
 */
function resolveProxyServerPath(): string {
  const sibling = path.join(__dirname, 'proxyServer.js');
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is __dirname + literal filename
  if (existsSync(sibling)) return sibling;
  const parent = path.join(__dirname, '..', 'proxyServer.js');
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is __dirname + literal filename
  if (existsSync(parent)) return parent;
  return sibling;
}

function resolveContext7ProxyPath(): string {
  const sibling = path.join(__dirname, 'context7Proxy.js');
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is __dirname + literal filename
  if (existsSync(sibling)) return sibling;
  const parent = path.join(__dirname, '..', 'context7Proxy.js');
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is __dirname + literal filename
  if (existsSync(parent)) return parent;
  return sibling;
}

export function buildProxyServerEntry(): McpServerConfig {
  return {
    type: 'stdio',
    command: 'node',
    args: [resolveProxyServerPath(), PROXY_CONFIG_PATH],
    alwaysLoad: true,
  };
}

export function buildContext7ProxyEntry(): McpServerConfig {
  return {
    type: 'stdio',
    command: 'node',
    args: [resolveContext7ProxyPath()],
  };
}

export function augmentProxyServers(
  serversToProxy: Record<string, McpServerConfig>,
): Record<string, McpServerConfig> {
  if (Object.keys(serversToProxy).length === 0) return serversToProxy;
  if (serversToProxy.context7 || !process.env.CONTEXT7_API_KEY) return serversToProxy;
  return {
    ...serversToProxy,
    context7: buildContext7ProxyEntry(),
  };
}

export async function writeProxyConfig(
  serversToProxy: Record<string, McpServerConfig>,
): Promise<void> {
  const proxyConfig = { servers: augmentProxyServers(serversToProxy) };
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- temp config path in os.tmpdir()
  await fs.writeFile(PROXY_CONFIG_PATH, JSON.stringify(proxyConfig, null, 2), 'utf-8');
}
