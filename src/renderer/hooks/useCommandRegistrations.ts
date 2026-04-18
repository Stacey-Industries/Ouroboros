/**
 * useCommandRegistrations — registers agent templates, layout switching,
 * and multi-session commands in the command palette.
 *
 * Extracted from InnerApp to reduce complexity.
 */

import { useEffect } from 'react';

import type { Command } from '../components/CommandPalette/types';
import type { AgentTemplate, WorkspaceLayout } from '../types/electron';
import { resolveTemplate } from '../utils/templateResolver';
import {
  OPEN_AGENT_CHAT_PANEL_EVENT,
  OPEN_COMPARE_PROVIDERS_EVENT,
  OPEN_LATEST_AGENT_CHAT_DETAILS_EVENT,
  OPEN_USAGE_DASHBOARD_EVENT,
  RESUME_LATEST_AGENT_CHAT_THREAD_EVENT,
} from './appEventNames';

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

function dispatchDomEvent(eventName: string, detail?: unknown): void {
  window.dispatchEvent(
    detail === undefined
      ? new CustomEvent(eventName)
      : new CustomEvent(eventName, { detail }),
  );
}

export function useAgentTemplateCommands(
  projectRoot: string | null,
  registerCommand: (cmd: Command) => void,
): void {
  useEffect(() => {
    if (!hasElectronAPI()) return;

    void window.electronAPI.config.get('agentTemplates').then((templates: AgentTemplate[]) => {
      if (!templates || templates.length === 0) return;

      const children: Command[] = templates.map((t) => ({
        id: `agent-template:${t.id}`,
        label: t.name,
        category: 'terminal' as const,
        icon: t.icon ?? '\u25C6',
        action: () => {
          const ctx = {
            projectRoot,
            projectName: projectRoot?.replace(/\\/g, '/').split('/').pop() ?? '',
            openFile: null as string | null,
            openFileName: null as string | null,
          };
          const resolvedPrompt = resolveTemplate(t.promptTemplate, ctx);
          window.dispatchEvent(new CustomEvent('agent-ide:spawn-claude-template', {
            detail: { prompt: resolvedPrompt, label: t.name, cliOverrides: t.cliOverrides },
          }));
        },
      }));

      registerCommand({
        id: 'agent:templates',
        label: 'Agent Templates',
        category: 'terminal',
        icon: '\u25C6',
        action: () => { /* submenu */ },
        children,
      });
    });
  }, [projectRoot, registerCommand]);
}

export interface LayoutCommandsOptions {
  workspaceLayouts: WorkspaceLayout[];
  activeLayoutName: string;
  registerCommand: (cmd: Command) => void;
  handleSelectLayout: (layout: WorkspaceLayout) => void;
  handleSaveLayout: (name: string) => void;
}

export function useLayoutCommands(opts: LayoutCommandsOptions): void {
  const { workspaceLayouts, activeLayoutName, registerCommand, handleSelectLayout, handleSaveLayout } = opts;

  useEffect(() => {
    if (!workspaceLayouts) return;
    const children: Command[] = workspaceLayouts.map((layout, idx) => ({
      id: `layout:switch:${layout.name}`,
      label: layout.name,
      category: 'view' as const,
      shortcut: idx < 3 ? `Ctrl+Alt+${idx + 1}` : undefined,
      icon: layout.name === activeLayoutName ? '\u25CF' : '\u25CB',
      action: () => handleSelectLayout(layout),
    }));

    registerCommand({
      id: 'layout:switch',
      label: 'Switch Layout',
      category: 'view',
      icon: '\u229E',
      action: () => { /* submenu */ },
      children,
    });

    registerCommand({
      id: 'layout:save-current',
      label: 'Save Current Layout',
      category: 'view',
      icon: '\u229E',
      action: () => {
        const name = prompt('Enter a name for this layout:');
        if (name && name.trim()) handleSaveLayout(name.trim());
      },
    });
  }, [workspaceLayouts, activeLayoutName, registerCommand, handleSelectLayout, handleSaveLayout]);
}

export function useMultiSessionCommand(
  registerCommand: (cmd: Command) => void,
): void {
  useEffect(() => {
    registerCommand({
      id: 'agent:multi-session',
      label: 'Launch Multi-Session',
      category: 'terminal',
      icon: '\u2B58',
      action: () => {
        window.dispatchEvent(new CustomEvent('agent-ide:open-multi-session'));
      },
    });
  }, [registerCommand]);
}

export function useAgentChatCommands(
  projectRoot: string | null,
  registerCommand: (cmd: Command) => void,
): void {
  useEffect(() => {
    const detail = projectRoot ? { workspaceRoot: projectRoot } : undefined;

    registerCommand({
      id: 'agent-chat:open',
      label: 'Open Agent Chat',
      category: 'view',
      icon: '💬',
      action: () => {
        dispatchDomEvent(OPEN_AGENT_CHAT_PANEL_EVENT);
      },
    });

    registerCommand({
      id: 'agent-chat:resume-latest-thread',
      label: 'Resume Latest Agent Thread',
      category: 'app',
      icon: '💬',
      when: () => Boolean(projectRoot),
      action: () => {
        dispatchDomEvent(RESUME_LATEST_AGENT_CHAT_THREAD_EVENT, detail);
      },
    });

    registerCommand({
      id: 'agent-chat:open-latest-details',
      label: 'Open Latest Agent Task Details',
      category: 'app',
      icon: '◎',
      when: () => Boolean(projectRoot),
      action: () => {
        dispatchDomEvent(OPEN_LATEST_AGENT_CHAT_DETAILS_EVENT, detail);
      },
    });
  }, [projectRoot, registerCommand]);
}

export function useUsageDashboardCommand(
  registerCommand: (cmd: Command) => void,
): void {
  useEffect(() => {
    registerCommand({
      id: 'usage:dashboard',
      label: 'Open Usage Dashboard',
      category: 'view',
      icon: '◫',
      action: () => {
        dispatchDomEvent(OPEN_USAGE_DASHBOARD_EVENT);
      },
    });
  }, [registerCommand]);
}

export function useCompareProvidersCommand(
  registerCommand: (cmd: Command) => void,
  multiProvider: boolean,
): void {
  useEffect(() => {
    if (!multiProvider) return;
    registerCommand({
      id: 'compare-providers:open',
      label: 'Compare Providers Side-by-Side',
      category: 'view',
      icon: '⧉',
      action: () => {
        dispatchDomEvent(OPEN_COMPARE_PROVIDERS_EVENT);
      },
    });
  }, [registerCommand, multiProvider]);
}

