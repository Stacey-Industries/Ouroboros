/**
 * codemodeManagerScopes.ts — Scope-specific enable/restore logic.
 *
 * Wave 53k: extracted from codemodeManager.
 *
 * Phase A (initial 53k): project-scope disable was a flag-toggle on
 * `~/.claude.json projects.<root>.{enabled,disabled}McpjsonServers`,
 * leaving `<root>/.mcp.json` untouched. This tracked the documented
 * Claude Code semantics for `disabledMcpjsonServers`.
 *
 * Phase B″ (this revision): empirical smoke against Claude Code v2.1.122 on
 * Windows showed the agent still loaded `.mcp.json` ouroboros despite both
 *   (a) `--strict-mcp-config` (which the docs claim bypasses `.mcp.json`)
 *   (b) `disabledMcpjsonServers: ["ouroboros"]` set on the project entry.
 * Both layers leak. The architecturally correct response — per the user's
 * "do the hard work, no work-arounds" directive — is to make our own
 * contract reliable rather than depend on a CLI flag the binary doesn't
 * honor or a config flag with platform-specific bugs. So:
 *
 *   - Global: unchanged. Remove from `~/.claude.json mcpServers`, back up
 *     the original config blob in the restoration file.
 *   - Project: REMOVE the proxied server entries from `<root>/.mcp.json
 *     mcpServers`, back up the verbatim config blob in the restoration
 *     file. Restore (verbatim) on disable. The `~/.claude.json projects`
 *     flag toggle is dropped — it was redundant given the destructive
 *     write makes the entry simply not exist for Claude Code to discover.
 *
 * Crash safety: writes are atomic (`.tmp` + rename). The restoration file
 * is the recovery source. `enableCodeMode` self-heals on next launch by
 * applying any stale restoration record before starting a new enable.
 */

import {
  atomicWriteJson,
  buildProxyServerEntry,
  getServerMap,
  type JsonRecord,
  type McpServerConfig,
  projectMcpJsonPath,
  readJsonTolerant,
  userClaudeJsonPath,
} from './codemodeManagerFiles';

// ─── Read helpers ─────────────────────────────────────────────────────────────

export async function readGlobalServers(): Promise<Record<string, McpServerConfig>> {
  return getServerMap(await readJsonTolerant(userClaudeJsonPath(), '~/.claude.json'));
}

export async function readProjectServerMap(
  projectRoot: string,
): Promise<Record<string, McpServerConfig>> {
  return getServerMap(await readJsonTolerant(projectMcpJsonPath(projectRoot), '.mcp.json'));
}

// ─── Global enable ────────────────────────────────────────────────────────────

export interface GlobalEnableResult {
  proxiedConfigs: Record<string, McpServerConfig>;
  backup: Record<string, McpServerConfig>;
}

export async function applyGlobalEnable(serverNames: string[]): Promise<GlobalEnableResult> {
  const claudeJson = ((await readJsonTolerant(userClaudeJsonPath(), '~/.claude.json')) ??
    {}) as JsonRecord;
  const servers = { ...getServerMap(claudeJson) };
  const proxiedConfigs: Record<string, McpServerConfig> = {};
  const backup: Record<string, McpServerConfig> = {};

  for (const name of serverNames) {
    // eslint-disable-next-line security/detect-object-injection -- name from caller-provided list
    const cfg = servers[name];
    if (!cfg) continue;
    // eslint-disable-next-line security/detect-object-injection -- name from same
    proxiedConfigs[name] = cfg;
    // eslint-disable-next-line security/detect-object-injection -- name from same
    backup[name] = cfg;
    // eslint-disable-next-line security/detect-object-injection -- name from same
    delete servers[name];
  }

  servers['__codemode_proxy'] = buildProxyServerEntry();
  claudeJson.mcpServers = servers;
  await atomicWriteJson(userClaudeJsonPath(), claudeJson);

  return { proxiedConfigs, backup };
}

// ─── Project enable (destructive write to .mcp.json) ─────────────────────────

export interface ProjectEnableResult {
  proxiedConfigs: Record<string, McpServerConfig>;
  /** Verbatim backup — keyed by server name, value is the entry we removed from .mcp.json. */
  backup: Record<string, McpServerConfig>;
}

export async function applyProjectEnable(
  projectRoot: string,
  serverNames: string[],
): Promise<ProjectEnableResult> {
  const filePath = projectMcpJsonPath(projectRoot);
  const existing = await readJsonTolerant(filePath, '.mcp.json');
  if (existing === null) return { proxiedConfigs: {}, backup: {} };
  const data = (existing ?? {}) as JsonRecord;
  const servers = { ...getServerMap(data) };
  const proxiedConfigs: Record<string, McpServerConfig> = {};
  const backup: Record<string, McpServerConfig> = {};

  for (const name of serverNames) {
    // eslint-disable-next-line security/detect-object-injection -- name from caller-provided list
    const cfg = servers[name];
    if (!cfg) continue;
    // eslint-disable-next-line security/detect-object-injection -- name from same
    proxiedConfigs[name] = cfg;
    // eslint-disable-next-line security/detect-object-injection -- name from same
    backup[name] = cfg;
    // eslint-disable-next-line security/detect-object-injection -- name from same
    delete servers[name];
  }

  if (Object.keys(backup).length === 0) return { proxiedConfigs, backup };

  // Wave 60: always emit `mcpServers` (even when empty). Claude Code's
  // /doctor schema validator rejects bare `{}` with "Does not adhere to
  // MCP server configuration schema" — `{mcpServers: {}}` is required.
  data.mcpServers = servers;
  await atomicWriteJson(filePath, data);

  return { proxiedConfigs, backup };
}

// ─── Rollback (when no servers actually matched) ──────────────────────────────

export async function rollbackEmptyEnable(): Promise<void> {
  const claudeJson = ((await readJsonTolerant(userClaudeJsonPath(), '~/.claude.json')) ??
    {}) as JsonRecord;
  const servers = { ...getServerMap(claudeJson) };
  delete servers['__codemode_proxy'];
  if (Object.keys(servers).length === 0) {
    delete claudeJson.mcpServers;
  } else {
    claudeJson.mcpServers = servers;
  }
  await atomicWriteJson(userClaudeJsonPath(), claudeJson);
}

// ─── Restore: global ──────────────────────────────────────────────────────────

export async function restoreGlobal(globalBackup: Record<string, McpServerConfig>): Promise<void> {
  const claudeJson = ((await readJsonTolerant(userClaudeJsonPath(), '~/.claude.json')) ??
    {}) as JsonRecord;
  const servers = { ...getServerMap(claudeJson) };
  delete servers['__codemode_proxy'];
  for (const [name, cfg] of Object.entries(globalBackup)) {
    // eslint-disable-next-line security/detect-object-injection -- name from our own restoration record
    servers[name] = cfg;
  }
  if (Object.keys(servers).length === 0) {
    delete claudeJson.mcpServers;
  } else {
    claudeJson.mcpServers = servers;
  }
  await atomicWriteJson(userClaudeJsonPath(), claudeJson);
}

// ─── Restore: project (resurrect .mcp.json entries) ───────────────────────────

export async function restoreProject(
  projectBackup: Record<string, Record<string, McpServerConfig>>,
): Promise<void> {
  for (const [projectRoot, configs] of Object.entries(projectBackup)) {
    if (Object.keys(configs).length === 0) continue;
    const filePath = projectMcpJsonPath(projectRoot);
    const existing = await readJsonTolerant(filePath, '.mcp.json');
    if (existing === null) continue;
    const data = (existing ?? {}) as JsonRecord;
    const servers = { ...getServerMap(data) };
    for (const [name, cfg] of Object.entries(configs)) {
      // eslint-disable-next-line security/detect-object-injection -- name from our own restoration record
      servers[name] = cfg;
    }
    data.mcpServers = servers;
    await atomicWriteJson(filePath, data);
  }
}
