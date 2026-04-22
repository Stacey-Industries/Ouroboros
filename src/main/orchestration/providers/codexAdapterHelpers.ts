/**
 * codexAdapterHelpers.ts — Pure helper functions for codexAdapter.ts.
 *
 * Isolated here to keep codexAdapter.ts under 300 lines.
 */

import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import { unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';

import type { ImageAttachment } from '../../agentChat/types';
import {
  applyCodexPermissionModeOverride,
  buildCodexCliArgs,
  mapEffortToCodexReasoning,
} from '../../codex';
import { type CodexCliSettings, getConfigValue } from '../../config';
import type { ProviderCapabilities } from '../types';
import type { ProviderLaunchContext, ProviderResumeContext } from './providerAdapter';

export type CodexTransport = 'app-server' | 'exec';

export interface CodexAppServerCapability {
  available: boolean;
  reason?: string;
  version?: string;
}

export interface CodexTransportDecision {
  capability: CodexAppServerCapability;
  transport: CodexTransport;
  warning?: string;
}

const MIN_CODEX_APP_SERVER_VERSION = '0.122.0';
const INTERACTIVE_PERMISSION_MODES = new Set(['acceptEdits', 'plan']);

let cachedCodexAppServerCapability: CodexAppServerCapability | null = null;
let capabilityProbeOverride: (() => CodexAppServerCapability) | null = null;

export async function materializeAttachments(
  attachments: ImageAttachment[],
): Promise<{ imagePaths: string[] }> {
  const imagePaths: string[] = [];
  for (const attachment of attachments) {
    const ext = attachment.mimeType.split('/')[1] ?? 'png';
    const tempPath = `${tmpdir()}/${randomUUID()}.${ext}`;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- tempPath is randomUUID-based, not user-controlled
    await writeFile(tempPath, Buffer.from(attachment.base64Data, 'base64'));
    imagePaths.push(tempPath);
  }
  return { imagePaths };
}

export async function cleanupTempFiles(tempPaths: string[]): Promise<void> {
  for (const tempPath of tempPaths) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- tempPath is randomUUID-based, not user-controlled
      await unlink(tempPath);
    } catch {
      // ignore temp cleanup errors
    }
  }
}

export function buildFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createCodexCapabilities(): ProviderCapabilities {
  return {
    provider: 'codex',
    supportsStreaming: true,
    supportsResume: true,
    supportsStructuredEdits: false,
    supportsToolUse: true,
    supportsContextCaching: false,
    maxContextHint: null,
    requiresTerminalSession: false,
    requiresHookEvents: false,
  };
}

function getCodexFeatureFlag(): boolean {
  const ecosystem = getConfigValue('ecosystem') as { codexAppServerTransport?: boolean } | undefined;
  return ecosystem?.codexAppServerTransport === true;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function parseCodexVersion(raw: string): string | undefined {
  const match = raw.match(/(\d+\.\d+\.\d+)/);
  return match?.[1];
}

function probeCodexCommand(args: string[]): { output: string; status: number | null } {
  const result = spawnSync('codex', args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 5000,
  });
  return {
    output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim(),
    status: result.status,
  };
}

function probeCodexAppServerCapability(): CodexAppServerCapability {
  const versionProbe = probeCodexCommand(['--version']);
  const version = parseCodexVersion(versionProbe.output);
  if (!version) {
    return { available: false, reason: 'Codex version could not be determined.' };
  }
  if (compareVersions(version, MIN_CODEX_APP_SERVER_VERSION) < 0) {
    return {
      available: false,
      reason: `Codex ${version} is older than required ${MIN_CODEX_APP_SERVER_VERSION}.`,
      version,
    };
  }
  const helpProbe = probeCodexCommand(['app-server', '--help']);
  if (helpProbe.status !== 0 || !helpProbe.output.toLowerCase().includes('app-server')) {
    return {
      available: false,
      reason: 'Installed Codex CLI does not expose the app-server subcommand.',
      version,
    };
  }
  return { available: true, version };
}

export function getCachedCodexAppServerCapability(): CodexAppServerCapability {
  if (cachedCodexAppServerCapability) return cachedCodexAppServerCapability;
  cachedCodexAppServerCapability = capabilityProbeOverride?.() ?? probeCodexAppServerCapability();
  return cachedCodexAppServerCapability;
}

export function resetCodexAppServerCapabilityCacheForTests(): void {
  cachedCodexAppServerCapability = null;
  capabilityProbeOverride = null;
}

export function setCodexAppServerCapabilityProbeForTests(
  probe: (() => CodexAppServerCapability) | null,
): void {
  capabilityProbeOverride = probe;
  cachedCodexAppServerCapability = null;
}

function isInteractivePermissionMode(permissionMode: string | undefined): boolean {
  return permissionMode ? INTERACTIVE_PERMISSION_MODES.has(permissionMode) : false;
}

export function supportsCodexChatPermissionMode(
  settings: CodexCliSettings,
  transport: CodexTransport = 'exec',
): boolean {
  if (transport === 'app-server') return true;
  return settings.dangerouslyBypassApprovalsAndSandbox || settings.approvalPolicy === 'never';
}

function assertCodexChatPermissionMode(
  settings: CodexCliSettings,
  transport: CodexTransport,
): void {
  if (supportsCodexChatPermissionMode(settings, transport)) return;
  throw new Error(
    'Codex chat cannot use interactive approval modes on the current exec transport. Use Workspace Auto or Bypass.',
  );
}

export function getCodexTransportDecision(
  context: ProviderLaunchContext | ProviderResumeContext,
): CodexTransportDecision {
  if (!getCodexFeatureFlag()) {
    return {
      capability: { available: false, reason: 'Feature flag disabled.' },
      transport: 'exec',
    };
  }
  const capability = getCachedCodexAppServerCapability();
  if (!capability.available) {
    const modeNote = isInteractivePermissionMode(context.request.permissionMode)
      ? ' Interactive approval modes will still fall back to the legacy exec behavior.'
      : '';
    return {
      capability,
      transport: 'exec',
      warning: `Codex app-server transport unavailable: ${capability.reason ?? 'unknown reason'}.${modeNote}`,
    };
  }
  return { capability, transport: 'app-server' };
}

export function resolveCodexTransport(
  context: ProviderLaunchContext | ProviderResumeContext,
): CodexTransport {
  return getCodexTransportDecision(context).transport;
}

export function resolveCodexSettings(
  context: ProviderLaunchContext | ProviderResumeContext,
  transport: CodexTransport = 'exec',
): {
  cliArgs: string[];
  model: string;
  settings: CodexCliSettings;
} {
  const baseSettings = getConfigValue('codexCliSettings') as CodexCliSettings;
  const permissionAdjusted = applyCodexPermissionModeOverride(
    baseSettings,
    context.request.permissionMode,
  );
  const requestReasoning = mapEffortToCodexReasoning(context.request.effort);
  const settings: CodexCliSettings = {
    ...permissionAdjusted,
    model: context.request.model || permissionAdjusted.model || '',
    reasoningEffort: requestReasoning ?? permissionAdjusted.reasoningEffort ?? '',
  };
  assertCodexChatPermissionMode(settings, transport);
  return {
    cliArgs: buildCodexCliArgs(settings, 'exec'),
    model: settings.model,
    settings,
  };
}
