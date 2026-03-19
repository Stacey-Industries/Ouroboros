import { app, BrowserWindow, dialog,Menu, MenuItemConstructorOptions, shell } from 'electron'

import { broadcastToWebClients } from './web/webServer'
import { createWindow, setWindowProjectRoot } from './windowManager'

function sendMenuEvent(win: BrowserWindow, channel: string): void {
  win.webContents.send(channel)
  broadcastToWebClients(channel, undefined)
}

async function openFolderInNewWindow(win: BrowserWindow): Promise<void> {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Open Folder in New Window'
  })
  if (!result.canceled && result.filePaths.length > 0) {
    const projectRoot = result.filePaths[0]
    const newWin = createWindow(projectRoot)
    setWindowProjectRoot(newWin.id, projectRoot)
  }
}

function buildMacAppMenu(): MenuItemConstructorOptions {
  return {
    label: app.name,
    submenu: [
      { role: 'about' as const },
      { type: 'separator' as const },
      { role: 'services' as const },
      { type: 'separator' as const },
      { role: 'hide' as const },
      { role: 'hideOthers' as const },
      { role: 'unhide' as const },
      { type: 'separator' as const },
      { role: 'quit' as const }
    ]
  }
}

function buildFileMenu(win: BrowserWindow, isMac: boolean): MenuItemConstructorOptions {
  return {
    label: 'File',
    submenu: [
      { label: 'Open Folder…', accelerator: 'CmdOrCtrl+O', click: () => sendMenuEvent(win, 'menu:open-folder') },
      { type: 'separator' },
      { label: 'New Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => createWindow() },
      { label: 'Open in New Window…', click: async () => openFolderInNewWindow(win) },
      { type: 'separator' },
      { label: 'New Terminal', accelerator: 'CmdOrCtrl+T', click: () => sendMenuEvent(win, 'menu:new-terminal') },
      { type: 'separator' },
      isMac ? { role: 'close' as const } : { role: 'quit' as const }
    ]
  }
}

function buildEditMenu(isMac: boolean): MenuItemConstructorOptions {
  return {
    label: 'Edit',
    submenu: [
      { role: 'undo' as const },
      { role: 'redo' as const },
      { type: 'separator' as const },
      { role: 'cut' as const },
      { role: 'copy' as const },
      { role: 'paste' as const },
      ...(isMac
        ? [{ role: 'pasteAndMatchStyle' as const }, { role: 'delete' as const }, { role: 'selectAll' as const }]
        : [{ role: 'delete' as const }, { type: 'separator' as const }, { role: 'selectAll' as const }])
    ]
  }
}

function buildViewMenu(win: BrowserWindow): MenuItemConstructorOptions {
  return {
    label: 'View',
    submenu: [
      { role: 'reload' as const },
      { role: 'forceReload' as const },
      { role: 'toggleDevTools' as const },
      { type: 'separator' as const },
      { role: 'resetZoom' as const },
      { role: 'zoomIn' as const },
      { role: 'zoomOut' as const },
      { type: 'separator' as const },
      { role: 'togglefullscreen' as const },
      { type: 'separator' as const },
      { label: 'Command Palette', accelerator: 'CmdOrCtrl+Shift+P', click: () => sendMenuEvent(win, 'menu:command-palette') },
      { type: 'separator' },
      { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => sendMenuEvent(win, 'menu:settings') }
    ]
  }
}

function buildWindowMenu(isMac: boolean): MenuItemConstructorOptions {
  return {
    label: 'Window',
    submenu: [
      { role: 'minimize' as const },
      { role: 'zoom' as const },
      ...(isMac
        ? [
            { type: 'separator' as const },
            { role: 'front' as const },
            { type: 'separator' as const },
            { role: 'window' as const }
          ]
        : [{ role: 'close' as const }])
    ]
  }
}

function buildHelpMenu(): MenuItemConstructorOptions {
  return {
    role: 'help' as const,
    submenu: [
      { label: 'Learn More', click: async () => shell.openExternal('https://claude.ai/claude-code') },
      { label: 'Open Logs Folder', click: async () => shell.openPath(app.getPath('logs')) }
    ]
  }
}

export function buildApplicationMenu(win: BrowserWindow): void {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [buildMacAppMenu()] : []),
    buildFileMenu(win, isMac),
    buildEditMenu(isMac),
    buildViewMenu(win),
    buildWindowMenu(isMac),
    buildHelpMenu(),
  ]
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}
