/**
 * scopedMcpConfig.ts — Builds a per-spawn scoped MCP config temp file.
 *
 * Wave 48 Phase D: each headless spawn gets a temp JSON file listing only the
 * MCP servers it should see, replacing the global settings inheritance model.
 *
 * Wave 51 Phase C: the per-spawn ouroboros routing decision is now made by
 * `internalMcpRoutingPolicy.decideInternalMcpRouting`. Three outcomes:
 *
 *   - 'direct-inject'           : write `{ouroboros: {url|command,args}}` into
 *                                 the temp config (today's behavior).
 *   - 'route-through-codemode'  : omit `ouroboros`; the `__codemode_proxy`
 *                                 entry that codemodeManager added to
 *                                 `~/.claude.json mcpServers` flows through
 *                                 via the user-server pass-through and
 *                                 surfaces the graph tools as
 *                                 `servers.ouroboros.*` inside `execute_code`.
 *   - 'omit'                    : skip entirely (scope=never, or task-gated +
 *                                 non-graph task).
 *
 * Wave 53k follow-up: `readGlobalMcpServers` reads `~/.claude.json` (the file
 * Claude Code CLI actually uses) instead of `~/.claude/settings.json`. The
 * pre-fix reader silently returned `{}` for users whose servers lived in
 * `~/.claude.json`, so the temp config had no servers and `__codemode_proxy`
 * never got passed through. With `--strict-mcp-config` (always on for
 * scoped-config spawns — see `claudeStreamJsonRunner.appendMcpConfigFlags`),
 * the temp config is the SOLE source Claude Code consults — `.mcp.json` and
 * other discovery paths are bypassed.
 *
 * Returns { configPath, cleanup }.  Caller MUST call cleanup() after the
 * spawned process exits, on both success and error paths.
 */

import { readFile, unlink, writeFile } from 'fs/promises';
import { homedir, tmpdir } from 'os';
import path, { join } from 'path';

import { getConfigValue } from '../../config';
import { getInternalMcpUrl } from '../../internalMcp/internalMcpPortRegistry';
import { type InternalMcpScope, resolveInternalMcpScope } from '../../internalMcp/internalMcpScope';
import type { InternalMcpTransport } from '../../internalMcp/internalMcpTypes';
import log from '../../logger';
import { classifyGoal, type GoalShape } from './goalClassifier';
import {
  decideInternalMcpRouting,
  downgradeOnCodemodeFailure,
  type RoutingDecision,
} from './internalMcpRoutingPolicy';
import { computeMcpCostFields, emitMcpSpawnCost } from './mcpSpawnCostTelemetry';

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
  /** Final routing outcome that produced this config (post-downgrade). */
  routingDecision: RoutingDecision;
}

// ---------------------------------------------------------------------------
// Reading user-configured servers from ~/.claude.json
//
// Wave 53k follow-up: this file is what Claude Code CLI actually reads for
// MCP server discovery. The pre-fix path read `~/.claude/settings.json`
// (Anthropic Desktop's file, ignored by the CLI), which meant the temp
// config silently dropped all user servers AND `__codemode_proxy`.
// ---------------------------------------------------------------------------

async function readGlobalMcpServers(): Promise<McpServerMap> {
  const userConfigPath = join(homedir(), '.claude.json');
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from homedir() + known filename
    const raw = await readFile(userConfigPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return (parsed.mcpServers ?? {}) as McpServerMap;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Ouroboros entry shape (transport-aware, Phase C)
//
// Phase B added a transport-aware builder in `internalMcpAutoInject.ts`, but
// importing from the `internalMcp` barrel here pulls in `internalMcpServer.ts`
// → `internalMcpTools.ts` → graph controller (which depends on Electron `app`
// at module load). The per-spawn path runs in tests without Electron, so we
// inline the small entry-shape decision here. The shape MUST stay in sync
// with `buildOuroborosEntry` in `internalMcpAutoInject.ts`.
// ---------------------------------------------------------------------------

function resolveTransport(): InternalMcpTransport {
  const cfg = getConfigValue('internalMcp') as { transport?: string } | undefined;
  return cfg?.transport === 'stdio' ? 'stdio' : 'sse';
}

function buildOuroborosEntry(
  ouroborosUrl: string | null,
  mainOutDir: string,
): McpServerEntry | null {
  if (ouroborosUrl === null) return null;
  const transport = resolveTransport();
  if (transport === 'stdio') {
    const port = portFromUrl(ouroborosUrl);
    if (port === null) return null;
    const stdioTransportPath = path.join(mainOutDir, 'internalMcpStdioTransport.js');
    return { command: 'node', args: [stdioTransportPath, port] };
  }
  return { url: ouroborosUrl };
}

function portFromUrl(url: string): string | null {
  const match = /:(\d+)\//.exec(url);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Server map assembly
// ---------------------------------------------------------------------------

interface ServerMapInputs {
  userServers: McpServerMap;
  decision: RoutingDecision;
  ouroborosEntry: McpServerEntry | null;
}

function buildServerMap(inputs: ServerMapInputs): McpServerMap {
  const result: McpServerMap = {};
  // Pass through all user servers except ouroboros (managed separately).
  for (const [name, cfg] of Object.entries(inputs.userServers)) {
    if (name !== 'ouroboros') {
      // eslint-disable-next-line security/detect-object-injection -- name is a parsed settings key, not user input
      result[name] = cfg;
    }
  }
  if (inputs.decision === 'direct-inject' && inputs.ouroborosEntry) {
    result['ouroboros'] = inputs.ouroborosEntry;
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
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from tmpdir() + sessionId + timestamp
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
// Routing decision
// ---------------------------------------------------------------------------

interface CodemodeConfig {
  enabled?: boolean;
  /** Wave 53l Phase B — deprecated; ignored by routing. Kept on type for back-compat. */
  routeInternalMcp?: boolean;
  excludeFromMultiplex?: string[];
}

function readCodemodeFlags(): { enabled: boolean; ouroborosExcluded: boolean } {
  const cfg = getConfigValue('codemode') as CodemodeConfig | undefined;
  const excludes = cfg?.excludeFromMultiplex ?? [];
  return {
    enabled: cfg?.enabled === true,
    ouroborosExcluded: excludes.includes('ouroboros'),
  };
}

function readScopeFromConfig(): InternalMcpScope {
  const raw = getConfigValue('internalMcpScope');
  if (raw === 'always' || raw === 'task-gated' || raw === 'never') return raw;
  return 'task-gated';
}

function deriveRoutingDecision(opts: ScopedMcpConfigOptions): RoutingDecision {
  const scope = resolveInternalMcpScope({ goalShape: opts.goalShape });
  if (!scope.shouldInjectOuroboros) {
    log.info('[scoped-mcp] omit ouroboros:', scope.reason);
    return 'omit';
  }
  const flags = readCodemodeFlags();
  const decision = decideInternalMcpRouting({
    codemodeEnabled: flags.enabled,
    ouroborosExcludedFromMultiplex: flags.ouroborosExcluded,
    internalMcpScope: readScopeFromConfig(),
    taskNeedsGraphTools: true,
    transport: resolveTransport(),
  });
  const final = opts.codemodeAcquireFailed ? downgradeOnCodemodeFailure(decision) : decision;
  log.info('[scoped-mcp] routing decision:', final, '(scope:', scope.reason + ')');
  return final;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ScopedMcpConfigOptions {
  goalShape: GoalShape;
  sessionId: string;
  /**
   * Wave 51 Phase C — when the launch-path codemode acquire failed, set this
   * so the routing policy downgrades 'route-through-codemode' to
   * 'direct-inject'. Optional; defaults to false (no downgrade).
   */
  codemodeAcquireFailed?: boolean;
  /**
   * Absolute directory containing the main process build output. Used to
   * resolve `internalMcpStdioTransport.js` for the stdio transport entry.
   * Defaults to `__dirname` of the calling main module.
   */
  mainOutDir?: string;
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

  const decision = deriveRoutingDecision(opts);
  const [userServers, ouroborosUrl] = await Promise.all([
    readGlobalMcpServers(),
    Promise.resolve(getInternalMcpUrl()),
  ]);

  const ouroborosEntry =
    decision === 'direct-inject'
      ? buildOuroborosEntry(ouroborosUrl, opts.mainOutDir ?? __dirname)
      : null;
  const servers = buildServerMap({ userServers, decision, ouroborosEntry });
  const configPath = makeTempPath(opts.sessionId);
  await writeTempConfig(configPath, servers);

  log.info('[scoped-mcp] wrote config to', configPath, '— servers:', Object.keys(servers));
  emitSpawnCostTelemetry({ opts, decision, servers });
  return { configPath, cleanup: makeCleanup(configPath), routingDecision: decision };
}

/**
 * Wave 51 Phase D — emit per-spawn MCP cost telemetry. Non-blocking; the
 * underlying writer swallows I/O failures and only warn-logs.
 */
function emitSpawnCostTelemetry(args: {
  opts: ScopedMcpConfigOptions;
  decision: RoutingDecision;
  servers: McpServerMap;
}): void {
  try {
    const flags = readCodemodeFlags();
    const cost = computeMcpCostFields(args.servers);
    emitMcpSpawnCost({
      ts: Date.now(),
      spawnId: args.opts.sessionId,
      routingDecision: args.decision,
      internalMcpScope: readScopeFromConfig(),
      transport: resolveTransport(),
      codemodeEnabled: flags.enabled,
      ...cost,
    });
  } catch (err) {
    log.warn('[scoped-mcp] cost telemetry emit failed:', err);
  }
}

export interface ResolveMcpConfigOptions {
  goal: string | undefined | null;
  sessionId: string;
  invocationTempPaths: string[];
  codemodeAcquireFailed?: boolean;
}

/**
 * Launch-path wrapper. Classifies the goal, builds the scoped config, pushes
 * the temp path into the invocation cleanup list, returns the path or undefined.
 */
export async function resolveMcpConfigPathForLaunch(
  opts: ResolveMcpConfigOptions,
): Promise<string | undefined> {
  try {
    const scoped = await buildScopedMcpConfig({
      goalShape: classifyGoal(opts.goal),
      sessionId: opts.sessionId,
      codemodeAcquireFailed: opts.codemodeAcquireFailed,
    });
    if (!scoped) return undefined;
    opts.invocationTempPaths.push(scoped.configPath);
    return scoped.configPath;
  } catch (err) {
    log.warn('[scoped-mcp] config build failed; falling back to inheritance:', err);
    return undefined;
  }
}
