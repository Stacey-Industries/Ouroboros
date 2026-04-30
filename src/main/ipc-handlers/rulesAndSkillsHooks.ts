/**
 * ipc-handlers/rulesAndSkillsHooks.ts — Hooks-config IPC handlers.
 *
 * Extracted from rulesAndSkills.ts to keep the parent under the 300-line
 * ESLint limit. Same-shape registrar pattern: takes a channels array,
 * appends the handler names it registers.
 */

import { ipcMain } from 'electron';

import { addHook, readHooksConfig, removeHook } from '../rulesAndSkills/hooksManager';

function fail(error: unknown): { success: false; error: string } {
  return { success: false, error: error instanceof Error ? error.message : String(error) };
}

function registerHooksGetConfig(channels: string[]): void {
  ipcMain.handle('hooks:getConfig', async (_event, scope: string, projectRoot?: string) => {
    try {
      const hooks = await readHooksConfig(scope as 'global' | 'project', projectRoot);
      return { success: true, hooks };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('hooks:getConfig');
}

type AddHookArgs = {
  scope: string;
  eventType: string;
  command: string;
  matcher?: string;
  projectRoot?: string;
};

async function handleAddHook(_event: unknown, args: AddHookArgs) {
  try {
    const { scope, eventType, command, matcher, projectRoot } = args;
    await addHook({
      scope: scope as 'global' | 'project',
      eventType,
      command,
      matcher,
      projectRoot,
    });
    return { success: true };
  } catch (error: unknown) {
    return fail(error);
  }
}

type RemoveHookArgs = { scope: string; eventType: string; index: number; projectRoot?: string };

async function handleRemoveHook(_event: unknown, args: RemoveHookArgs) {
  try {
    const { scope, eventType, index, projectRoot } = args;
    await removeHook(scope as 'global' | 'project', eventType, index, projectRoot);
    return { success: true };
  } catch (error: unknown) {
    return fail(error);
  }
}

function registerHooksAddRemove(channels: string[]): void {
  ipcMain.handle('hooks:addHook', handleAddHook);
  channels.push('hooks:addHook');
  ipcMain.handle('hooks:removeHook', handleRemoveHook);
  channels.push('hooks:removeHook');
}

export function registerHooksHandlers(channels: string[]): void {
  registerHooksGetConfig(channels);
  registerHooksAddRemove(channels);
}
