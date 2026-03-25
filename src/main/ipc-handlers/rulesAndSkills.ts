/**
 * ipc-handlers/rulesAndSkills.ts — Rules, Skills, and Hooks management IPC handlers
 */

import type { OrchestrationProvider } from '@shared/types/orchestrationDomain';
import { type BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import fs from 'fs';
import path from 'path';

import { addHook, readHooksConfig, removeHook } from '../rulesAndSkills/hooksManager';
import { listRulesFiles, readRulesFile } from '../rulesAndSkills/rulesReader';
import { expandSkill } from '../rulesAndSkills/skillExpander';
import { discoverSkills } from '../rulesAndSkills/skillsDiscovery';

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

async function expandSkillForProvider(
  projectRoot: string,
  skillId: string,
  params: Record<string, string>,
  provider: OrchestrationProvider,
): Promise<ReturnType<typeof expandSkill> | null> {
  const skills = await discoverSkills(projectRoot);
  const skill = skills.find((s) => s.id === skillId);
  if (!skill) return null;
  return expandSkill(skill, params, provider);
}

function registerSkillsHandlers(channels: string[]): void {
  ipcMain.handle('skills:list', async (_event, projectRoot: string) => {
    try {
      const skills = await discoverSkills(projectRoot);
      return { success: true, skills };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('skills:list');

  ipcMain.handle('skills:expand', async (_event, ...args: [string, string, Record<string, string>, string?]) => {
    try {
      const [projectRoot, skillId, params, provider] = args;
      const prov = (provider ?? 'claude-code') as OrchestrationProvider;
      const expansion = await expandSkillForProvider(projectRoot, skillId, params, prov);
      if (!expansion) return { success: false, error: `Skill not found: ${skillId}` };
      return { success: true, expansion };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('skills:expand');

  ipcMain.handle('skills:create', async (_event, projectRoot: string, name: string) => {
    try {
      const skillDir = path.join(projectRoot, '.ouroboros', 'skills', name);
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path composed from trusted projectRoot + known skills dir + user-supplied name (sanitised by path.join)
      fs.mkdirSync(skillDir, { recursive: true });
      const filePath = path.join(skillDir, 'SKILL.md');
      const scaffold = `---\nname: ${name}\ndescription: Describe what this skill does\n---\n\nYour skill instructions here.\n`;
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path composed from trusted projectRoot + known skills dir
      fs.writeFileSync(filePath, scaffold, 'utf8');
      return { success: true, filePath };
    } catch (error: unknown) {
      return fail(error);
    }
  });
  channels.push('skills:create');
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

export function registerRulesAndSkillsHandlers(_senderWindow: SenderWindow): string[] {
  void _senderWindow;
  const channels: string[] = [];
  registerRulesHandlers(channels);
  registerSkillsHandlers(channels);
  registerHooksHandlers(channels);
  return channels;
}
