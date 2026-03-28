/**
 * webPreloadApisRulesSkills.ts — rulesAndSkills API namespace builder for web preload shim.
 * Exports: buildRulesAndSkillsApi.
 */

import type { WebSocketTransport } from './webPreloadTransport';

// ─── Rules + Hooks + Claude Settings ─────────────────────────────────────────

function buildRulesApi(t: WebSocketTransport) {
  return {
    listRules: (projectRoot: string) =>
      t.invoke('rules:list', projectRoot),
    readRule: (projectRoot: string, type: 'claude-md' | 'agents-md') =>
      t.invoke('rules:read', projectRoot, type),
    createRule: (projectRoot: string, type: 'claude-md' | 'agents-md') =>
      t.invoke('rules:create', projectRoot, type),
    getHooksConfig: (scope: 'global' | 'project', projectRoot?: string) =>
      t.invoke('hooks:getConfig', scope, projectRoot),
    addHook: (args: {
      scope: 'global' | 'project';
      eventType: string;
      command: string;
      matcher?: string;
      projectRoot?: string;
    }) => t.invoke('hooks:addHook', args),
    removeHook: (args: {
      scope: 'global' | 'project';
      eventType: string;
      index: number;
      projectRoot?: string;
    }) => t.invoke('hooks:removeHook', args),
    readClaudeSettings: (scope: string, projectRoot?: string) =>
      t.invoke('claudeSettings:read', scope, projectRoot),
    readClaudeSettingsKey: (scope: string, key: string, projectRoot?: string) =>
      t.invoke('claudeSettings:readKey', scope, key, projectRoot),
    writeClaudeSettingsKey: (args: {
      scope: string;
      key: string;
      value: unknown;
      projectRoot?: string;
    }) => t.invoke('claudeSettings:writeKey', args),
  };
}

// ─── Commands CRUD ────────────────────────────────────────────────────────────

function buildCommandsApi(t: WebSocketTransport) {
  return {
    listCommands: (projectRoot?: string) =>
      t.invoke('commands:list', projectRoot),
    createCommand: (args: {
      scope: string;
      name: string;
      content: string;
      projectRoot?: string;
    }) => t.invoke('commands:create', args),
    readCommand: (args: { scope: string; name: string; projectRoot?: string }) =>
      t.invoke('commands:read', args),
    updateCommand: (args: {
      scope: string;
      name: string;
      content: string;
      projectRoot?: string;
    }) => t.invoke('commands:update', args),
    deleteCommand: (args: { scope: string; name: string; projectRoot?: string }) =>
      t.invoke('commands:delete', args),
  };
}

// ─── RulesDir + Watcher ───────────────────────────────────────────────────────

function buildRulesDirApi(t: WebSocketTransport) {
  return {
    listRuleFiles: (projectRoot?: string) =>
      t.invoke('rulesDir:list', projectRoot),
    createRuleFile: (args: {
      scope: string;
      name: string;
      content: string;
      projectRoot?: string;
    }) => t.invoke('rulesDir:create', args),
    readRuleFile: (args: { scope: string; name: string; projectRoot?: string }) =>
      t.invoke('rulesDir:read', args),
    updateRuleFile: (args: {
      scope: string;
      name: string;
      content: string;
      projectRoot?: string;
    }) => t.invoke('rulesDir:update', args),
    deleteRuleFile: (args: { scope: string; name: string; projectRoot?: string }) =>
      t.invoke('rulesDir:delete', args),
    startWatcher: (projectRoot: string) =>
      t.invoke('rulesAndSkills:startWatcher', projectRoot),
    onChanged: (callback: () => void): (() => void) =>
      t.on('rulesAndSkills:changed', callback as (v: unknown) => void),
  };
}

// ─── Public Builder ───────────────────────────────────────────────────────────

export function buildRulesAndSkillsApi(t: WebSocketTransport) {
  return { ...buildRulesApi(t), ...buildCommandsApi(t), ...buildRulesDirApi(t) };
}
