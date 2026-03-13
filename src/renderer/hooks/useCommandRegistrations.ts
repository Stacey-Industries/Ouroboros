/**
 * useCommandRegistrations — registers agent templates, layout switching,
 * and multi-session commands in the command palette.
 *
 * Extracted from InnerApp to reduce complexity.
 */

import { useEffect } from 'react';
import type { AgentTemplate, WorkspaceLayout } from '../types/electron';
import type { Command } from '../components/CommandPalette/types';
import { resolveTemplate } from '../utils/templateResolver';

function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
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
