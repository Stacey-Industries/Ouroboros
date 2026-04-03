/**
 * TitleBar menu definitions — data-driven, extracted to keep TitleBar.tsx under 300 lines.
 */

import {
  GO_BACK_EVENT,
  GO_FORWARD_EVENT,
  OPEN_EXTENSION_STORE_EVENT,
  OPEN_MCP_STORE_EVENT,
  OPEN_SETTINGS_PANEL_EVENT,
  SAVE_ALL_DIRTY_EVENT,
  SHOW_ABOUT_EVENT,
  SPLIT_EDITOR_EVENT,
  SPLIT_TERMINAL_EVENT,
} from '../../hooks/appEventNames';

export interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  divider?: boolean;
  disabled?: boolean;
}

export interface MenuDefinition {
  label: string;
  items: MenuItem[];
}

function dispatchEv(name: string, detail?: unknown): void {
  window.dispatchEvent(new CustomEvent(name, detail != null ? { detail } : undefined));
}

export const SEPARATOR: MenuItem = { label: '', divider: true };

function buildFileMenu(): MenuDefinition {
  return {
    label: 'File',
    items: [
      { label: 'New File', shortcut: 'Ctrl+N', action: () => dispatchEv('agent-ide:new-file') },
      { label: 'New Window', shortcut: 'Ctrl+Shift+N', action: () => window.electronAPI?.app?.newWindow?.() },
      SEPARATOR,
      { label: 'Open Folder', shortcut: 'Ctrl+O', action: () => dispatchEv('agent-ide:open-folder') },
      { label: 'Open File', shortcut: 'Ctrl+P', action: () => dispatchEv('agent-ide:open-file-picker') },
      SEPARATOR,
      { label: 'Save', shortcut: 'Ctrl+S', action: () => dispatchEv('agent-ide:save-active-file') },
      { label: 'Save All', shortcut: 'Ctrl+Shift+S', action: () => dispatchEv(SAVE_ALL_DIRTY_EVENT) },
      SEPARATOR,
      { label: 'Preferences', shortcut: 'Ctrl+,', action: () => dispatchEv(OPEN_SETTINGS_PANEL_EVENT) },
      { label: 'Extension Store', action: () => dispatchEv(OPEN_EXTENSION_STORE_EVENT) },
      { label: 'MCP Server Store', action: () => dispatchEv(OPEN_MCP_STORE_EVENT) },
      SEPARATOR,
      { label: 'Close Tab', shortcut: 'Ctrl+W', action: () => dispatchEv('agent-ide:close-active-tab') },
      { label: 'Close Window', shortcut: 'Alt+F4', action: () => window.close() },
    ],
  };
}

function buildEditMenu(): MenuDefinition {
  return {
    label: 'Edit',
    items: [
      { label: 'Undo', shortcut: 'Ctrl+Z', action: () => document.execCommand('undo') },
      { label: 'Redo', shortcut: 'Ctrl+Shift+Z', action: () => document.execCommand('redo') },
      SEPARATOR,
      { label: 'Cut', shortcut: 'Ctrl+X', action: () => document.execCommand('cut') },
      { label: 'Copy', shortcut: 'Ctrl+C', action: () => document.execCommand('copy') },
      { label: 'Paste', shortcut: 'Ctrl+V', action: () => document.execCommand('paste') },
      SEPARATOR,
      { label: 'Find', shortcut: 'Ctrl+F', action: () => dispatchEv('agent-ide:find') },
      { label: 'Replace', shortcut: 'Ctrl+H', action: () => dispatchEv('agent-ide:replace') },
      SEPARATOR,
      { label: 'Select All', shortcut: 'Ctrl+A', action: () => document.execCommand('selectAll') },
    ],
  };
}

function buildViewMenu(): MenuDefinition {
  return {
    label: 'View',
    items: [
      { label: 'Command Palette', shortcut: 'Ctrl+Shift+P', action: () => dispatchEv('agent-ide:command-palette') },
      { label: 'File Picker', shortcut: 'Ctrl+P', action: () => dispatchEv('agent-ide:open-file-picker') },
      SEPARATOR,
      { label: 'Toggle Sidebar', shortcut: 'Ctrl+B', action: () => dispatchEv('agent-ide:toggle-sidebar') },
      { label: 'Toggle Editor', action: () => dispatchEv('agent-ide:toggle-editor') },
      { label: 'Toggle Agent Panel', shortcut: 'Ctrl+\\', action: () => dispatchEv('agent-ide:toggle-agent-monitor') },
      { label: 'Toggle Terminal', shortcut: 'Ctrl+J', action: () => dispatchEv('agent-ide:toggle-terminal') },
      SEPARATOR,
      { label: 'Split Editor', shortcut: 'Ctrl+Shift+\\', action: () => dispatchEv(SPLIT_EDITOR_EVENT) },
      SEPARATOR,
      { label: 'Zoom In', shortcut: 'Ctrl+=', action: () => window.electronAPI?.app?.zoomIn?.() },
      { label: 'Zoom Out', shortcut: 'Ctrl+-', action: () => window.electronAPI?.app?.zoomOut?.() },
      { label: 'Reset Zoom', shortcut: 'Ctrl+0', action: () => window.electronAPI?.app?.zoomReset?.() },
      SEPARATOR,
      { label: 'Toggle Fullscreen', shortcut: 'F11', action: () => window.electronAPI?.app?.toggleFullscreen?.() },
    ],
  };
}

function buildGoMenu(): MenuDefinition {
  return {
    label: 'Go',
    items: [
      { label: 'Go to File', shortcut: 'Ctrl+P', action: () => dispatchEv('agent-ide:open-file-picker') },
      { label: 'Go to Symbol', shortcut: 'Ctrl+Shift+O', action: () => dispatchEv('agent-ide:open-symbol-search') },
      { label: 'Go to Line', shortcut: 'Ctrl+G', action: () => dispatchEv('agent-ide:go-to-line') },
      SEPARATOR,
      { label: 'Back', shortcut: 'Alt+Left', action: () => dispatchEv(GO_BACK_EVENT) },
      { label: 'Forward', shortcut: 'Alt+Right', action: () => dispatchEv(GO_FORWARD_EVENT) },
    ],
  };
}

function buildTerminalMenu(): MenuDefinition {
  return {
    label: 'Terminal',
    items: [
      { label: 'New Terminal', shortcut: 'Ctrl+Shift+`', action: () => dispatchEv('agent-ide:new-terminal') },
      { label: 'New Claude Terminal', shortcut: 'Ctrl+Shift+C', action: () => dispatchEv('agent-ide:new-claude-terminal') },
      { label: 'Split Terminal', action: () => dispatchEv(SPLIT_TERMINAL_EVENT) },
      SEPARATOR,
      { label: 'Clear Terminal', action: () => dispatchEv('agent-ide:clear-active-terminal') },
    ],
  };
}

function showAbout(): void {
  void window.electronAPI?.app?.getVersion?.().then((version) => {
    void window.electronAPI?.app?.getPlatform?.().then((platform) => {
      window.dispatchEvent(
        new CustomEvent(SHOW_ABOUT_EVENT, {
          detail: { version, platform },
        }),
      );
    });
  });
}

function buildHelpMenu(): MenuDefinition {
  return {
    label: 'Help',
    items: [
      { label: 'Documentation', action: () => window.electronAPI?.app?.openExternal?.('https://github.com/hesnotsoharry/Ouroboros') },
      { label: 'Keyboard Shortcuts', shortcut: 'Ctrl+K Ctrl+S', action: () => dispatchEv(OPEN_SETTINGS_PANEL_EVENT, 'keybindings') },
      SEPARATOR,
      { label: 'Open Logs Folder', action: () => window.electronAPI?.app?.openLogsFolder?.() },
      { label: 'Toggle Developer Tools', shortcut: 'Ctrl+Shift+I', action: () => window.electronAPI?.app?.toggleDevTools?.() },
      SEPARATOR,
      { label: 'About Ouroboros', action: showAbout },
    ],
  };
}

export function getMenuDefinitions(): MenuDefinition[] {
  return [buildFileMenu(), buildEditMenu(), buildViewMenu(), buildGoMenu(), buildTerminalMenu(), buildHelpMenu()];
}
