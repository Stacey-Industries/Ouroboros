import { ipcRenderer } from 'electron';

import type { ElectronAPI } from '../renderer/types/electron';

type RulesAndSkillsApi = ElectronAPI['rulesAndSkills'];

function onChannel<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

export const rulesAndSkillsApi: RulesAndSkillsApi = {
  listRules: (projectRoot: string) =>
    ipcRenderer.invoke('rules:list', projectRoot),
  readRule: (projectRoot: string, type: string) =>
    ipcRenderer.invoke('rules:read', projectRoot, type),
  createRule: (projectRoot: string, type: string) =>
    ipcRenderer.invoke('rules:create', projectRoot, type),
  listCommands: (projectRoot?: string) =>
    ipcRenderer.invoke('commands:list', projectRoot),
  createCommand: (args: { scope: string; name: string; content: string; projectRoot?: string }) =>
    ipcRenderer.invoke('commands:create', args),
  readCommand: (args: { scope: string; name: string; projectRoot?: string }) =>
    ipcRenderer.invoke('commands:read', args),
  updateCommand: (args: { scope: string; name: string; content: string; projectRoot?: string }) =>
    ipcRenderer.invoke('commands:update', args),
  deleteCommand: (args: { scope: string; name: string; projectRoot?: string }) =>
    ipcRenderer.invoke('commands:delete', args),
  listRuleFiles: (projectRoot?: string) =>
    ipcRenderer.invoke('rulesDir:list', projectRoot),
  createRuleFile: (args: { scope: string; name: string; content: string; projectRoot?: string }) =>
    ipcRenderer.invoke('rulesDir:create', args),
  readRuleFile: (args: { scope: string; name: string; projectRoot?: string }) =>
    ipcRenderer.invoke('rulesDir:read', args),
  updateRuleFile: (args: { scope: string; name: string; content: string; projectRoot?: string }) =>
    ipcRenderer.invoke('rulesDir:update', args),
  deleteRuleFile: (args: { scope: string; name: string; projectRoot?: string }) =>
    ipcRenderer.invoke('rulesDir:delete', args),
  getHooksConfig: (scope: string, projectRoot?: string) =>
    ipcRenderer.invoke('hooks:getConfig', scope, projectRoot),
  addHook: (args: { scope: string; eventType: string; command: string; matcher?: string; projectRoot?: string }) =>
    ipcRenderer.invoke('hooks:addHook', args),
  removeHook: (args: { scope: string; eventType: string; index: number; projectRoot?: string }) =>
    ipcRenderer.invoke('hooks:removeHook', args),
  readClaudeSettings: (scope: string, projectRoot?: string) =>
    ipcRenderer.invoke('claudeSettings:read', scope, projectRoot),
  readClaudeSettingsKey: (scope: string, key: string, projectRoot?: string) =>
    ipcRenderer.invoke('claudeSettings:readKey', scope, key, projectRoot),
  writeClaudeSettingsKey: (args: { scope: string; key: string; value: unknown; projectRoot?: string }) =>
    ipcRenderer.invoke('claudeSettings:writeKey', args),
  startWatcher: (projectRoot: string) =>
    ipcRenderer.invoke('rulesAndSkills:startWatcher', projectRoot),
  onChanged: (callback: () => void) =>
    onChannel<void>('rulesAndSkills:changed', callback),
};
