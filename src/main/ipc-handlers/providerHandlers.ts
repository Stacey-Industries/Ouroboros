/**
 * providerHandlers.ts — Provider + Codex IPC handler registration.
 *
 * Extracted from ipc.ts to keep that file under the 300-line ESLint limit.
 * Registers: providers:list, providers:getSlots, providers:checkAllAvailability,
 *            codex:listModels, codex:resolveThreadId.
 */

import { ipcMain } from 'electron';

import { hasSecureKey } from '../auth/secureKeyStore';
import { listCodexModels } from '../codex';
import { getConfigValue } from '../config';
import { getAllProviders } from '../providers';
import { ClaudeSessionProvider } from '../providers/claudeSessionProvider';
import { CodexSessionProvider } from '../providers/codexSessionProvider';
import { GeminiSessionProvider } from '../providers/geminiSessionProvider';
import type { CodexThreadCaptureArgs } from '../ptyCodexCapture';
import { resolveCodexThreadId } from '../ptyCodexCapture';

async function handleCheckAllAvailability(): Promise<object> {
  const [claude, codex, gemini] = await Promise.all([
    new ClaudeSessionProvider().checkAvailability(),
    new CodexSessionProvider().checkAvailability(),
    new GeminiSessionProvider().checkAvailability(),
  ]);
  return {
    success: true,
    availability: { claude: claude.available, codex: codex.available, gemini: gemini.available },
  };
}

export function registerProviderHandlers(channels: string[]): void {
  ipcMain.handle('providers:list', async () => {
    const providers = getAllProviders();
    const mapped = await Promise.all(
      providers.map(async (p) => {
        const hasKey = p.apiKey || (await hasSecureKey(`provider-key:${p.id}`));
        return { ...p, apiKey: hasKey ? '••••••••' : '' };
      }),
    );
    return mapped;
  });

  ipcMain.handle('providers:getSlots', () => getConfigValue('modelSlots'));
  ipcMain.handle('providers:checkAllAvailability', () => handleCheckAllAvailability());
  ipcMain.handle('codex:listModels', () => listCodexModels());
  ipcMain.handle('codex:resolveThreadId', (_event, args: CodexThreadCaptureArgs) =>
    resolveCodexThreadId(args),
  );

  channels.push(
    'providers:list',
    'providers:getSlots',
    'providers:checkAllAvailability',
    'codex:listModels',
    'codex:resolveThreadId',
  );
}
