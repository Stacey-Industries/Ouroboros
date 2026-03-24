/**
 * codexAdapterHelpers.ts — Pure helper functions for codexAdapter.ts.
 *
 * Isolated here to keep codexAdapter.ts under 300 lines.
 */

import { randomUUID } from 'crypto';
import { unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';

import type { ImageAttachment } from '../../agentChat/types';

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

import {
  applyCodexPermissionModeOverride,
  buildCodexCliArgs,
  mapEffortToCodexReasoning,
} from '../../codex';
import { type CodexCliSettings, getConfigValue } from '../../config';
import type { ProviderCapabilities } from '../types';
import type { ProviderLaunchContext, ProviderResumeContext } from './providerAdapter';

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

export function resolveCodexSettings(context: ProviderLaunchContext | ProviderResumeContext): {
  cliArgs: string[];
  model: string;
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
  return { cliArgs: buildCodexCliArgs(settings, 'exec'), model: settings.model };
}
