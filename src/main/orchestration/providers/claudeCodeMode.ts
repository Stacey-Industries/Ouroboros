/**
 * claudeCodeMode.ts — Wave 51 Phase B launch wiring for CodeMode.
 *
 * Bridges `codemodeManager` (which has been dormant since the subsystem was
 * built) into the Claude Code launch path. Gated on `codemode.enabled`
 * (default false). Phase C will formalize a per-spawn routing policy in
 * `internalMcpRoutingPolicy.ts`; this module exists so Phase B can prove the
 * end-to-end wiring without that policy in place.
 *
 * The integration is best-effort:
 *   - Failures to enable are logged and swallowed; the spawn proceeds without
 *     CodeMode rather than aborting (graceful downgrade is the wave-level
 *     acceptance criterion for crash recovery).
 *   - `enableCodeMode` is idempotent here — when codemodeManager reports
 *     "already enabled" we treat it as success because another concurrent
 *     spawn is already using the proxy. Phase C tightens this with a
 *     reference count once the routing policy lands.
 *   - Disable runs on both success and error completion paths.
 */

import {
  disableCodeMode,
  enableCodeMode,
  getMcpServers,
  isCodeModeEnabled,
} from '../../codemode/codemodeManager';
import { getConfigValue } from '../../config';
import log from '../../logger';
import { decideInternalMcpRouting } from './internalMcpRoutingPolicy';

interface CodeModeConfig {
  enabled?: boolean;
  routeInternalMcp?: boolean;
}

interface InternalMcpConfig {
  transport?: 'sse' | 'stdio';
}

interface ScopeConfigShape {
  raw: 'always' | 'task-gated' | 'never';
}

function readScopeRaw(): ScopeConfigShape['raw'] {
  const raw = getConfigValue('internalMcpScope');
  if (raw === 'always' || raw === 'task-gated' || raw === 'never') return raw;
  return 'task-gated';
}

/** True when CodeMode launch wiring is requested by config. */
export function isCodeModeLaunchEnabled(): boolean {
  const cfg = getConfigValue('codemode') as CodeModeConfig | undefined;
  return cfg?.enabled === true;
}

/** Resolve the upstream server names CodeMode should proxy for this spawn. */
async function resolveProxiedServerNames(projectRoot: string | undefined): Promise<string[]> {
  const cfg = getConfigValue('codemode') as CodeModeConfig | undefined;
  const internalMcp = getConfigValue('internalMcp') as InternalMcpConfig | undefined;
  const entries = await getMcpServers(projectRoot);
  // Phase C: delegate the inclusion rule to the routing policy. We treat the
  // task as graph-needing (taskNeedsGraphTools=true) because at acquire-time
  // we don't have the per-spawn goal — the launch path's per-spawn temp
  // config is where the goal-shape gate is enforced. If the policy returns
  // 'route-through-codemode' we add 'ouroboros' to the proxied list.
  const decision = decideInternalMcpRouting({
    codemodeEnabled: cfg?.enabled === true,
    routeInternalMcp: cfg?.routeInternalMcp === true,
    internalMcpScope: readScopeRaw(),
    taskNeedsGraphTools: true,
    transport: internalMcp?.transport === 'stdio' ? 'stdio' : 'sse',
  });
  const enabled = entries.filter((e) => e.enabled).map((e) => e.name);
  if (decision !== 'route-through-codemode') return enabled.filter((n) => n !== 'ouroboros');
  return enabled.includes('ouroboros') ? enabled : [...enabled, 'ouroboros'];
}

export interface CodeModeLaunchHandle {
  /** True when this caller successfully enabled CodeMode (and so owns disable). */
  ownsLifecycle: boolean;
}

/**
 * Enable CodeMode for an upcoming Claude Code spawn. Caller must call
 * `releaseCodeModeForLaunch` on both success and error paths when
 * `ownsLifecycle` is true.
 */
export async function acquireCodeModeForLaunch(
  projectRoot: string | undefined,
): Promise<CodeModeLaunchHandle> {
  if (!isCodeModeLaunchEnabled()) return { ownsLifecycle: false };

  if (isCodeModeEnabled()) {
    log.info('[codemode] already enabled — joining existing proxy');
    return { ownsLifecycle: false };
  }

  try {
    const serverNames = await resolveProxiedServerNames(projectRoot);
    if (serverNames.length === 0) {
      log.info('[codemode] no upstream servers to proxy — skipping enable');
      return { ownsLifecycle: false };
    }
    const scope: 'global' | 'project' = projectRoot ? 'project' : 'global';
    const result = await enableCodeMode(serverNames, scope, projectRoot);
    if (!result.success) {
      log.warn('[codemode] enable failed; falling back to direct inject:', result.error);
      return { ownsLifecycle: false };
    }
    log.info('[codemode] enabled for launch — proxied:', serverNames.join(','));
    return { ownsLifecycle: true };
  } catch (err) {
    log.warn('[codemode] enable threw; falling back to direct inject:', err);
    return { ownsLifecycle: false };
  }
}

/** Disable CodeMode after a launch completes. Idempotent and best-effort. */
export async function releaseCodeModeForLaunch(handle: CodeModeLaunchHandle): Promise<void> {
  if (!handle.ownsLifecycle) return;
  try {
    const result = await disableCodeMode();
    if (!result.success) {
      log.warn('[codemode] disable returned error (ignored):', result.error);
    }
  } catch (err) {
    log.warn('[codemode] disable threw (ignored):', err);
  }
}
