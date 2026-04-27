/**
 * Workbench-specific menu definitions (Wave 59 Phase C).
 * Extracted from TitleBar.menus.ts to stay under the 300-line limit.
 */

import {
  OPEN_SETTINGS_PANEL_EVENT,
  SET_THEME_EVENT,
  TOGGLE_IMMERSIVE_CHAT_EVENT,
  WORKBENCH_FIND_NEXT_EVENT,
  WORKBENCH_FIND_PREV_EVENT,
  WORKBENCH_NEW_CHAT_EVENT,
  WORKBENCH_NEW_SESSION_EVENT,
  WORKBENCH_OPEN_CHAT_SEARCH_EVENT,
  WORKBENCH_OPEN_PROJECT_EVENT,
  WORKBENCH_SWITCH_PROJECT_EVENT,
  WORKBENCH_TOGGLE_ARTIFACT_PANE_EVENT,
  WORKBENCH_TOGGLE_INNER_SIDEBAR_EVENT,
  WORKBENCH_TOGGLE_OUTER_RAIL_EVENT,
  WORKBENCH_TOGGLE_TERMINAL_DOCK_EVENT,
  WORKBENCH_TOGGLE_UTILITY_DRAWER_EVENT,
} from '../../hooks/appEventNames';
import type { MenuDefinition, MenuItem } from './TitleBar.menus';
import { SEPARATOR, showAbout } from './TitleBar.menus';

export interface WorkbenchMenuOptions {
  /** Recent project paths (max 5 shown). Populates Switch Project submenu. */
  recentProjects?: string[];
}

function dispatchEv(name: string, detail?: unknown): void {
  window.dispatchEvent(new CustomEvent(name, detail != null ? { detail } : undefined));
}

/** Theme names in display order. Matches themeList in src/renderer/themes/index.ts. */
const WORKBENCH_THEMES: Array<{ id: string; label: string }> = [
  { id: 'retro', label: 'Retro' },
  { id: 'modern', label: 'Modern' },
  { id: 'warp', label: 'Warp' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'kiro', label: 'Kiro' },
  { id: 'light', label: 'Light' },
  { id: 'high-contrast', label: 'High Contrast' },
];

function buildThemeSubmenu(): MenuItem[] {
  return WORKBENCH_THEMES.map(({ id, label }) => ({
    label,
    action: () => dispatchEv(SET_THEME_EVENT, id),
  }));
}

function buildSwitchProjectSubmenu(recentProjects: string[]): MenuItem[] {
  if (recentProjects.length === 0) {
    return [{ label: 'No recent projects', disabled: true }];
  }
  return recentProjects.slice(0, 5).map((path) => ({
    label: path,
    action: () => dispatchEv(WORKBENCH_SWITCH_PROJECT_EVENT, path),
  }));
}

function buildWorkbenchFileMenu(opts: WorkbenchMenuOptions): MenuDefinition {
  const recents = opts.recentProjects ?? [];
  return {
    label: 'File',
    items: [
      {
        label: 'New Session',
        shortcut: 'Ctrl+Shift+N',
        action: () => dispatchEv(WORKBENCH_NEW_SESSION_EVENT),
      },
      {
        label: 'New Chat in Active Session',
        shortcut: 'Ctrl+N',
        action: () => dispatchEv(WORKBENCH_NEW_CHAT_EVENT),
      },
      SEPARATOR,
      {
        label: 'Open Project',
        shortcut: 'Ctrl+O',
        action: () => dispatchEv(WORKBENCH_OPEN_PROJECT_EVENT),
      },
      { label: 'Switch Project', submenu: buildSwitchProjectSubmenu(recents) },
      SEPARATOR,
      {
        label: 'Exit Chat Mode',
        shortcut: 'Ctrl+Alt+I',
        action: () => dispatchEv(TOGGLE_IMMERSIVE_CHAT_EVENT),
      },
    ],
  };
}

function buildWorkbenchEditMenu(): MenuDefinition {
  return {
    label: 'Edit',
    items: [
      { label: 'Cut', shortcut: 'Ctrl+X', action: () => document.execCommand('cut') },
      { label: 'Copy', shortcut: 'Ctrl+C', action: () => document.execCommand('copy') },
      { label: 'Paste', shortcut: 'Ctrl+V', action: () => document.execCommand('paste') },
      SEPARATOR,
      {
        label: 'Find in Chat',
        shortcut: 'Ctrl+F',
        action: () => dispatchEv(WORKBENCH_OPEN_CHAT_SEARCH_EVENT),
      },
      { label: 'Find Next', shortcut: 'F3', action: () => dispatchEv(WORKBENCH_FIND_NEXT_EVENT) },
      {
        label: 'Find Previous',
        shortcut: 'Shift+F3',
        action: () => dispatchEv(WORKBENCH_FIND_PREV_EVENT),
      },
    ],
  };
}

function buildWorkbenchViewMenu(): MenuDefinition {
  return {
    label: 'View',
    items: [
      {
        label: 'Toggle Outer Rail',
        shortcut: 'Ctrl+B',
        action: () => dispatchEv(WORKBENCH_TOGGLE_OUTER_RAIL_EVENT),
      },
      {
        label: 'Toggle Inner Sidebar',
        shortcut: 'Ctrl+\\',
        action: () => dispatchEv(WORKBENCH_TOGGLE_INNER_SIDEBAR_EVENT),
      },
      SEPARATOR,
      {
        label: 'Toggle Utility Drawer',
        action: () => dispatchEv(WORKBENCH_TOGGLE_UTILITY_DRAWER_EVENT),
      },
      {
        label: 'Toggle Terminal Dock',
        shortcut: 'Ctrl+J',
        action: () => dispatchEv(WORKBENCH_TOGGLE_TERMINAL_DOCK_EVENT),
      },
      {
        label: 'Toggle Artifact Pane',
        action: () => dispatchEv(WORKBENCH_TOGGLE_ARTIFACT_PANE_EVENT),
      },
      SEPARATOR,
      {
        label: 'Switch to IDE Shell',
        shortcut: 'Ctrl+Alt+I',
        action: () => dispatchEv(TOGGLE_IMMERSIVE_CHAT_EVENT),
      },
    ],
  };
}

function buildWorkbenchToolsMenu(): MenuDefinition {
  return {
    label: 'Tools',
    items: [
      {
        label: 'Settings',
        shortcut: 'Ctrl+,',
        action: () => dispatchEv(OPEN_SETTINGS_PANEL_EVENT),
      },
      {
        label: 'Keyboard Shortcuts',
        shortcut: 'Ctrl+K Ctrl+S',
        action: () => dispatchEv(OPEN_SETTINGS_PANEL_EVENT, 'keybindings'),
      },
      SEPARATOR,
      { label: 'Theme', submenu: buildThemeSubmenu() },
    ],
  };
}

function buildWorkbenchHelpMenu(): MenuDefinition {
  return {
    label: 'Help',
    items: [
      { label: 'About Ouroboros', action: showAbout },
      {
        label: 'Documentation',
        action: () =>
          window.electronAPI?.app?.openExternal?.('https://github.com/hesnotsoharry/Ouroboros'),
      },
      {
        label: 'Report Issue',
        action: () =>
          window.electronAPI?.app?.openExternal?.(
            'https://github.com/hesnotsoharry/Ouroboros/issues',
          ),
      },
    ],
  };
}

export function getWorkbenchMenuDefinitions(opts: WorkbenchMenuOptions = {}): MenuDefinition[] {
  return [
    buildWorkbenchFileMenu(opts),
    buildWorkbenchEditMenu(),
    buildWorkbenchViewMenu(),
    buildWorkbenchToolsMenu(),
    buildWorkbenchHelpMenu(),
  ];
}
