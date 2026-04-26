/**
 * scopedMcpConfig.ts — Builds a per-spawn scoped MCP config temp file.
 *
 * Wave 48 Phase D: instead of relying on settings inheritance, each headless
 * spawn gets a temp JSON file that lists only the MCP servers it should see.
 * The ouroboros server is included or excluded based on resolveInternalMcpScope.
 * All other user-configured MCP servers (from ~/.claude/settings.json) pass
 * through unconditionally — they are not subject to the Ouroboros scope gate.
 *
 * Returns { configPath, cleanup }.  Caller MUST call cleanup() after the
 * spawned process exits, on both success and error paths.
 */

import { readFile, unlink, writeFile } from 'fs/promises';
import { homedir, tmpdir } from 'os';
import { join } from 'path';

import { getConfigValue } from '../../config';
import { getInternalMcpUrl } from '../../internalMcp/internalMcpPortRegistry';
import { resolveInternalMcpScope } from '../../internalMcp/internalMcpScope';
import log from '../../logger';
import { classifyGoal, type GoalShape } from './goalClassifier';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface McpServerEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

type McpServerMap = Record<string, McpServerEntry>;

interface ScopedMcpConfigResult {
  /** Absolute path to the written temp file. */
  configPath: string;
  /** Deletes the temp file. Safe to call multiple times. */
  cleanup: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Reading user-configured servers from ~/.claude/settings.json
// ---------------------------------------------------------------------------

async function readGlobalMcpServers(): Promise<McpServerMap> {
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from homedir() + known filename
    const raw = await readFile(settingsPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return (parsed.mcpServers ?? {}) as McpServerMap;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Server map assembly
// ---------------------------------------------------------------------------

function buildServerMap(
  userServers: McpServerMap,
  includeOuroboros: boolean,
  ouroborosUrl: string | null,
): McpServerMap {
  const result: McpServerMap = {};

  // Pass through all user servers except ouroboros (managed separately).
  for (const [name, cfg] of Object.entries(userServers)) {
    if (name !== 'ouroboros') {
      // eslint-disable-next-line security/detect-object-injection -- name comes from Object.entries of a parsed settings file, not user input
      result[name] = cfg;
    }
  }

  if (includeOuroboros && ouroborosUrl !== null) {
    result['ouroboros'] = { url: ouroborosUrl };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Temp file write + cleanup
// ---------------------------------------------------------------------------

function makeTempPath(sessionId: string): string {
  const stamp = Date.now();
  const filename = `ouroboros-mcp-${sessionId}-${stamp}.json`;
  return join(tmpdir(), filename);
}

async function writeTempConfig(configPath: string, servers: McpServerMap): Promise<void> {
  const content = JSON.stringify({ mcpServers: servers }, null, 2);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from tmpdir() + UUID + timestamp
  await writeFile(configPath, content, 'utf-8');
}

function makeCleanup(configPath: string): () => Promise<void> {
  let cleaned = false;
  return async () => {
    if (cleaned) return;
    cleaned = true;
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- same tmpdir path, not user-controlled
      await unlink(configPath);
    } catch {
      // Ignore — OS will reclaim temp files eventually.
    }
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ScopedMcpConfigOptions {
  goalShape: GoalShape;
  sessionId: string;
}

/**
 * Builds the scoped MCP config file for a single headless spawn.
 *
 * Returns null when the useStrictConfig feature flag is off — callers
 * should fall through to settings inheritance in that case.
 */
export async function buildScopedMcpConfig(
  opts: ScopedMcpConfigOptions,
): Promise<ScopedMcpConfigResult | null> {
  const useStrict = getConfigValue('internalMcpUseStrictConfig');
  if (useStrict === false) return null;

  const decision = resolveInternalMcpScope({ goalShape: opts.goalShape });
  log.info('[scoped-mcp] scope decision:', decision.reason);

  const [userServers, ouroborosUrl] = await Promise.all([
    readGlobalMcpServers(),
    Promise.resolve(getInternalMcpUrl()),
  ]);

  const servers = buildServerMap(userServers, decision.shouldInjectOuroboros, ouroborosUrl);
  const configPath = makeTempPath(opts.sessionId);
  await writeTempConfig(configPath, servers);

  log.info('[scoped-mcp] wrote config to', configPath, '— servers:', Object.keys(servers));
  return { configPath, cleanup: makeCleanup(configPath) };
}

/**
 * Launch-path wrapper. Classifies the goal, builds the scoped config, pushes
 * the temp path into the invocation cleanup list, returns the path or undefined.
 */
export async function resolveMcpConfigPathForLaunch(
  goal: string | undefined | null,
  sessionId: string,
  invocationTempPaths: string[],
): Promise<string | undefined> {
  try {
    const scoped = await buildScopedMcpConfig({ goalShape: classifyGoal(goal), sessionId });
    if (!scoped) return undefined;
    invocationTempPaths.push(scoped.configPath);
    return scoped.configPath;
  } catch (err) {
    log.warn('[scoped-mcp] config build failed; falling back to inheritance:', err);
    return undefined;
  }
}
