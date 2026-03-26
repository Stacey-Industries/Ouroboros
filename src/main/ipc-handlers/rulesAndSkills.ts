/**
 * ipc-handlers/rulesAndSkills.ts — Rules, Commands, and Hooks management IPC handlers
 */

import type { ClaudeConfigScope } from '@shared/types/claudeConfig';
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import fs from 'fs';
import path from 'path';

import { discoverCommands } from '../rulesAndSkills/commandsDiscovery';
import { createCommand, deleteCommand, readCommand, updateCommand } from '../rulesAndSkills/commandsManager';
import { addHook, readHooksConfig, removeHook } from '../rulesAndSkills/hooksManager';
import { createRuleFile, deleteRuleFile, discoverRuleFiles, readRuleFile, updateRuleFile } from '../rulesAndSkills/rulesDirectoryManager';
import { listRulesFiles, readRulesFile } from '../rulesAndSkills/rulesReader';
import { startRulesWatcher } from '../rulesAndSkills/rulesWatcher';
import { readClaudeSettings, readClaudeSettingsKey, writeClaudeSettingsKey } from '../rulesAndSkills/settingsManager';
import { broadcastToWebClients } from '../web/webServer';

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow;

function fail(error: unknown): { success: false; error: string } {
  return { success: false, error: error instanceof Error ? error.message : String(error) };
}

function registerRulesHandlers(channels: string[]): void {
  ipcMain.handle('rules:list', async (_event, projectRoot: string) => {
    try {
      const rules = await listRulesFiles(projectRoot);
      return { success: true, rules };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('rules:list');

  ipcMain.handle('rules:read', async (_event, projectRoot: string, type: 'claude-md' | 'agents-md') => {
    try {
      const result = await readRulesFile(projectRoot, type);
      return { success: true, content: result.content };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('rules:read');

  ipcMain.handle('rules:create', async (_event, projectRoot: string, type: 'claude-md' | 'agents-md') => {
    try {
      const fileName = type === 'claude-md' ? 'CLAUDE.md' : 'AGENTS.md';
      const filePath = path.join(projectRoot, fileName);
      const heading = type === 'claude-md' ? 'CLAUDE.md' : 'AGENTS.md';
      const agentLabel = type === 'claude-md' ? 'Claude Code' : 'Codex agents';
      const scaffold = `# ${heading}\n\nProject instructions for ${agentLabel}.\n`;
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path composed from trusted projectRoot + known filename
      fs.writeFileSync(filePath, scaffold, 'utf8');
      return { success: true, filePath };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('rules:create');
}

function registerHooksHandlers(channels: string[]): void {
  ipcMain.handle('hooks:getConfig', async (_event, scope: string, projectRoot?: string) => {
    try {
      const hooks = await readHooksConfig(scope as 'global' | 'project', projectRoot);
      return { success: true, hooks };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('hooks:getConfig');

  ipcMain.handle('hooks:addHook', async (_event, args: { scope: string; eventType: string; command: string; matcher?: string; projectRoot?: string }) => {
    try {
      const { scope, eventType, command, matcher, projectRoot } = args;
      await addHook({ scope: scope as 'global' | 'project', eventType, command, matcher, projectRoot });
      return { success: true };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('hooks:addHook');

  ipcMain.handle('hooks:removeHook', async (_event, args: { scope: string; eventType: string; index: number; projectRoot?: string }) => {
    try {
      const { scope, eventType, index, projectRoot } = args;
      await removeHook(scope as 'global' | 'project', eventType, index, projectRoot);
      return { success: true };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('hooks:removeHook');
}

function registerCommandsListAndCreate(channels: string[]): void {
  ipcMain.handle('commands:list', async (_event, projectRoot?: string) => {
    try {
      const commands = await discoverCommands(projectRoot);
      return { success: true, commands };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('commands:list');

  ipcMain.handle('commands:create', async (_event, args: { scope: string; name: string; content: string; projectRoot?: string }) => {
    try {
      const filePath = await createCommand(args.scope as ClaudeConfigScope, args.name, args.content, args.projectRoot);
      return { success: true, filePath };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('commands:create');
}

function registerCommandsCrud(channels: string[]): void {
  ipcMain.handle('commands:read', async (_event, args: { scope: string; name: string; projectRoot?: string }) => {
    try {
      const content = await readCommand(args.scope as ClaudeConfigScope, args.name, args.projectRoot);
      return { success: true, content };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('commands:read');

  ipcMain.handle('commands:update', async (_event, args: { scope: string; name: string; content: string; projectRoot?: string }) => {
    try {
      await updateCommand(args.scope as ClaudeConfigScope, args.name, args.content, args.projectRoot);
      return { success: true };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('commands:update');

  ipcMain.handle('commands:delete', async (_event, args: { scope: string; name: string; projectRoot?: string }) => {
    try {
      await deleteCommand(args.scope as ClaudeConfigScope, args.name, args.projectRoot);
      return { success: true };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('commands:delete');
}

function registerCommandsHandlers(channels: string[]): void {
  registerCommandsListAndCreate(channels);
  registerCommandsCrud(channels);
}

function registerRulesDirListAndCreate(channels: string[]): void {
  ipcMain.handle('rulesDir:list', async (_event, projectRoot?: string) => {
    try {
      const ruleFiles = await discoverRuleFiles(projectRoot);
      return { success: true, ruleFiles };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('rulesDir:list');

  ipcMain.handle('rulesDir:create', async (_event, args: { scope: string; name: string; content: string; projectRoot?: string }) => {
    try {
      const filePath = await createRuleFile(args.scope as ClaudeConfigScope, args.name, args.content, args.projectRoot);
      return { success: true, filePath };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('rulesDir:create');
}

function registerRulesDirCrud(channels: string[]): void {
  ipcMain.handle('rulesDir:read', async (_event, args: { scope: string; name: string; projectRoot?: string }) => {
    try {
      const content = await readRuleFile(args.scope as ClaudeConfigScope, args.name, args.projectRoot);
      return { success: true, content };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('rulesDir:read');

  ipcMain.handle('rulesDir:update', async (_event, args: { scope: string; name: string; content: string; projectRoot?: string }) => {
    try {
      await updateRuleFile(args.scope as ClaudeConfigScope, args.name, args.content, args.projectRoot);
      return { success: true };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('rulesDir:update');

  ipcMain.handle('rulesDir:delete', async (_event, args: { scope: string; name: string; projectRoot?: string }) => {
    try {
      await deleteRuleFile(args.scope as ClaudeConfigScope, args.name, args.projectRoot);
      return { success: true };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('rulesDir:delete');
}

function registerRulesDirHandlers(channels: string[]): void {
  registerRulesDirListAndCreate(channels);
  registerRulesDirCrud(channels);
}

function registerClaudeSettingsHandlers(channels: string[]): void {
  ipcMain.handle('claudeSettings:read', async (_event, scope: string, projectRoot?: string) => {
    try {
      const settings = await readClaudeSettings(scope as ClaudeConfigScope, projectRoot);
      return { success: true, settings };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('claudeSettings:read');

  ipcMain.handle('claudeSettings:readKey', async (_event, scope: string, key: string, projectRoot?: string) => {
    try {
      const value = await readClaudeSettingsKey(scope as ClaudeConfigScope, key, projectRoot);
      return { success: true, value };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('claudeSettings:readKey');

  ipcMain.handle('claudeSettings:writeKey', async (_event, args: { scope: string; key: string; value: unknown; projectRoot?: string }) => {
    try {
      await writeClaudeSettingsKey(args.scope as ClaudeConfigScope, args.key, args.value, args.projectRoot);
      return { success: true };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('claudeSettings:writeKey');
}

function broadcastChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('rulesAndSkills:changed');
  }
  broadcastToWebClients('rulesAndSkills:changed', {});
}

let stopWatcher: (() => void) | null = null;

function activateWatcher(channels: string[]): void {
  ipcMain.handle('rulesAndSkills:startWatcher', (_event, projectRoot: string) => {
    if (stopWatcher) stopWatcher();
    stopWatcher = startRulesWatcher(projectRoot, broadcastChanged);
    return { success: true };
  });
  channels.push('rulesAndSkills:startWatcher');
}

export function registerRulesAndSkillsHandlers(_senderWindow: SenderWindow): string[] {
  void _senderWindow;
  const channels: string[] = [];
  registerRulesHandlers(channels);
  registerCommandsHandlers(channels);
  registerRulesDirHandlers(channels);
  registerHooksHandlers(channels);
  registerClaudeSettingsHandlers(channels);
  activateWatcher(channels);
  return channels;
}
