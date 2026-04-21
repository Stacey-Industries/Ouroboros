import type { Command } from './types';

function dispatchIdeEvent(eventName: string, detail?: string): void {
  window.dispatchEvent(new CustomEvent(eventName, detail ? { detail } : undefined));
}

/** Material variant submenu — baseline polish (Vapor / Prism / Warp). */
export function materialVariantCommands(): Command {
  const variants: Array<{ id: 'vapor' | 'prism' | 'warp'; label: string }> = [
    { id: 'vapor', label: 'Vapor (Soft)' },
    { id: 'prism', label: 'Prism (Structured)' },
    { id: 'warp', label: 'Warp (Phosphor)' },
  ];
  return {
    id: 'material',
    label: 'Material',
    category: 'view',
    action: () => { /* submenu */ },
    children: variants.map((v) => ({
      id: `material:${v.id}`,
      label: v.label,
      category: 'view' as const,
      action: () => {
        dispatchIdeEvent('agent-ide:set-material-variant', v.id);
      },
    })),
  };
}

/** Theme submenu commands. */
export function themeCommands(): Command {
  const themes = [
    { id: 'retro', label: 'Retro', icon: '\u{1F7E2}' },
    { id: 'modern', label: 'Modern', icon: '\u{1F535}' },
    { id: 'warp', label: 'Warp', icon: '\u{1F7E3}' },
    { id: 'cursor', label: 'Cursor', icon: '⚫' },
    { id: 'kiro', label: 'Kiro', icon: '\u{1F7E1}' },
  ];
  return {
    id: 'theme',
    label: 'Theme',
    category: 'view',
    icon: '\u{1F3A8}',
    action: () => { /* submenu */ },
    children: themes.map((t) => ({
      id: `theme:${t.id}`,
      label: t.label,
      category: 'view' as const,
      icon: t.icon,
      action: () => {
        dispatchIdeEvent('agent-ide:set-theme', t.id);
      },
    })),
  };
}
