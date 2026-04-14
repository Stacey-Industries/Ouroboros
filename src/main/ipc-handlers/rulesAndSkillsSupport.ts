/**
 * ipc-handlers/rulesAndSkillsSupport.ts — Claude settings IPC handlers,
 * extracted from rulesAndSkills.ts to satisfy the 300-line limit.
 */

import type { ClaudeConfigScope } from '@shared/types/claudeConfig';
import { ipcMain } from 'electron';

import {
  readClaudeSettings,
  readClaudeSettingsKey,
  writeClaudeSettingsKey,
} from '../rulesAndSkills/settingsManager';

function fail(error: unknown): { success: false; error: string } {
  return { success: false, error: error instanceof Error ? error.message : String(error) };
}

export function registerClaudeSettingsHandlers(channels: string[]): void {
  ipcMain.handle('claudeSettings:read', async (_event, scope: string, projectRoot?: string) => {
    try {
      const settings = await readClaudeSettings(scope as ClaudeConfigScope, projectRoot);
      return { success: true, settings };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('claudeSettings:read');

  ipcMain.handle(
    'claudeSettings:readKey',
    async (_event, scope: string, key: string, projectRoot?: string) => {
      try {
        const value = await readClaudeSettingsKey(scope as ClaudeConfigScope, key, projectRoot);
        return { success: true, value };
      } catch (error: unknown) {
        return fail(error);
      }
    },
  );
  channels.push('claudeSettings:readKey');

  ipcMain.handle(
    'claudeSettings:writeKey',
    async (_event, args: { scope: string; key: string; value: unknown; projectRoot?: string }) => {
      try {
        await writeClaudeSettingsKey(args.scope as ClaudeConfigScope, args.key, args.value, args.projectRoot);
        return { success: true };
      } catch (error: unknown) {
        return fail(error);
      }
    },
  );
  channels.push('claudeSettings:writeKey');
}
