/**
 * ipc-handlers/rulesAndSkillsToggle.ts — Wave 62 ephemeral rule toggle handlers.
 *
 * Sub-registrar for `rulesDir:toggle` and `rulesDir:restoreAll`. Split from
 * `rulesAndSkills.ts` to keep that file under the 300-line ESLint cap.
 */

import type { ClaudeConfigScope } from '@shared/types/claudeConfig';
import { ipcMain } from 'electron';

import {
  disableRule,
  enableRule,
  restoreAllDisabled,
} from '../rulesAndSkills/rulesDirectoryManager';

type ToggleArgs = { scope: string; name: string; disable: boolean; projectRoot?: string };
type RestoreArgs = { scope: string; projectRoot?: string };

function fail(error: unknown): { success: false; error: string } {
  return { success: false, error: error instanceof Error ? error.message : String(error) };
}

async function handleToggle(_e: unknown, args: ToggleArgs, broadcastChanged: () => void) {
  try {
    const scope = args.scope as ClaudeConfigScope;
    if (args.disable) await disableRule(scope, args.name, args.projectRoot);
    else await enableRule(scope, args.name, args.projectRoot);
    broadcastChanged();
    return { success: true };
  } catch (error: unknown) {
    return fail(error);
  }
}

async function handleRestoreAll(_e: unknown, args: RestoreArgs, broadcastChanged: () => void) {
  try {
    const scope = args.scope as ClaudeConfigScope;
    const result = await restoreAllDisabled(scope, args.projectRoot);
    broadcastChanged();
    return { success: true, ...result };
  } catch (error: unknown) {
    return fail(error);
  }
}

export function registerRulesToggleHandlers(
  channels: string[],
  broadcastChanged: () => void,
): void {
  ipcMain.handle('rulesDir:toggle', (e, args: ToggleArgs) =>
    handleToggle(e, args, broadcastChanged),
  );
  channels.push('rulesDir:toggle');
  ipcMain.handle('rulesDir:restoreAll', (e, args: RestoreArgs) =>
    handleRestoreAll(e, args, broadcastChanged),
  );
  channels.push('rulesDir:restoreAll');
}
