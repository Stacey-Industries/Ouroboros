/**
 * miscRegistrarsHelpers.ts — Window and extension sub-registrars.
 *
 * Extracted from miscRegistrars.ts to keep each file under 300 lines.
 */

import { app, BrowserWindow, ipcMain, shell } from 'electron';
import fs from 'fs/promises';

import {
  closeWindow,
  createWindow,
  focusWindow,
  getWindow,
  getWindowInfos,
  getWindowProjectRoots,
  setWindowProjectRoot,
  setWindowProjectRoots,
} from '../windowManager';

type ChannelList = string[];
type IpcHandler = Parameters<typeof ipcMain.handle>[1];
type EmptySuccessResponse = { success: true };
type SuccessResponse<T extends object> = EmptySuccessResponse & T;
type FailureResponse = { success: false; error: string };

function registerChannel(channels: ChannelList, channel: string, handler: IpcHandler): void {
  ipcMain.handle(channel, handler);
  channels.push(channel);
}

function ok(): EmptySuccessResponse;
function ok<T extends object>(payload: T): SuccessResponse<T>;
function ok(payload?: object): EmptySuccessResponse | SuccessResponse<object> {
  return payload ? { success: true, ...payload } : { success: true };
}

function fail(error: unknown): FailureResponse {
  const message = error instanceof Error ? error.message : String(error);
  return { success: false, error: message };
}

async function runAction(
  action: () => Promise<unknown> | unknown,
): Promise<EmptySuccessResponse | FailureResponse> {
  try {
    await action();
    return ok();
  } catch (error) {
    return fail(error);
  }
}

async function runQuery<T extends object>(
  query: () => Promise<T> | T,
): Promise<SuccessResponse<T> | FailureResponse> {
  try {
    return ok(await query());
  } catch (error) {
    return fail(error);
  }
}

async function registerExtensionTask<T>(
  task: (extensions: typeof import('../extensions')) => Promise<T> | T,
): Promise<T | FailureResponse> {
  try {
    const extensions = await import('../extensions');
    return await task(extensions);
  } catch (error) {
    return fail(error);
  }
}

function registerWindowFrameControls(channels: ChannelList): void {
  registerChannel(channels, 'window:minimize', async (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
    return ok();
  });
  registerChannel(channels, 'window:maximize-toggle', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
    return ok();
  });
  registerChannel(channels, 'window:close-self', async (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
    return ok();
  });
  registerChannel(channels, 'window:toggle-fullscreen', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setFullScreen(!win.isFullScreen());
    return ok();
  });
  registerChannel(channels, 'window:toggle-devtools', async (event) => {
    const wc = BrowserWindow.fromWebContents(event.sender)?.webContents;
    if (wc) {
      if (wc.isDevToolsOpened()) wc.closeDevTools();
      else wc.openDevTools({ mode: 'detach' });
    }
    return ok();
  });
}

function registerWindowProjectHandlers(channels: ChannelList): void {
  registerChannel(channels, 'window:getSelf', async (event) =>
    runQuery(() => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) throw new Error('Unknown window');
      const managed = getWindow(win.id);
      return { windowId: win.id, projectRoot: managed?.projectRoot ?? null };
    }),
  );
  registerChannel(channels, 'window:setProjectRoot', async (event, projectRoot: string) =>
    runAction(() => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) throw new Error('Unknown window');
      setWindowProjectRoot(win.id, projectRoot);
    }),
  );
  registerChannel(channels, 'window:getProjectRoots', async (event) =>
    runQuery(() => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) throw new Error('Unknown window');
      return { roots: getWindowProjectRoots(win.id) };
    }),
  );
  registerChannel(channels, 'window:setProjectRoots', async (event, roots: string[]) =>
    runAction(() => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) throw new Error('Unknown window');
      setWindowProjectRoots(win.id, roots);
    }),
  );
}

export function registerWindowHandlers(channels: ChannelList): void {
  registerChannel(channels, 'window:new', (_event, projectRoot?: string) =>
    runQuery(() => {
      const newWindow = createWindow(projectRoot);
      if (projectRoot) setWindowProjectRoot(newWindow.id, projectRoot);
      return { windowId: newWindow.id };
    }),
  );
  registerChannel(channels, 'window:list', async () =>
    runQuery(() => ({ windows: getWindowInfos() })),
  );
  registerChannel(channels, 'window:focus', async (_event, windowId: number) =>
    runAction(() => focusWindow(windowId)),
  );
  registerChannel(channels, 'window:close', async (_event, windowId: number) =>
    runAction(() => closeWindow(windowId)),
  );
  registerWindowProjectHandlers(channels);
  registerWindowFrameControls(channels);
  registerChannel(channels, 'app:open-logs-folder', async () => {
    await shell.openPath(app.getPath('logs'));
    return ok();
  });
}

function openExtensionsFolder(extensions: typeof import('../extensions')): Promise<EmptySuccessResponse> {
  return (async () => {
    const extensionsPath = extensions.getExtensionsDirPath();
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- extensionsPath derived from extensions module, not user input
    await fs.mkdir(extensionsPath, { recursive: true });
    await shell.openPath(extensionsPath);
    return ok();
  })();
}

export function registerExtensionHandlers(channels: ChannelList): void {
  registerChannel(channels, 'extensions:list', async () =>
    registerExtensionTask((extensions) => ok({ extensions: extensions.listExtensions() })),
  );
  registerChannel(channels, 'extensions:enable', async (_event, name: string) =>
    registerExtensionTask((extensions) => extensions.enableExtension(name)),
  );
  registerChannel(channels, 'extensions:disable', async (_event, name: string) =>
    registerExtensionTask((extensions) => extensions.disableExtension(name)),
  );
  registerChannel(channels, 'extensions:install', async (_event, sourcePath: string) =>
    registerExtensionTask((extensions) => extensions.installExtension(sourcePath)),
  );
  registerChannel(channels, 'extensions:uninstall', async (_event, name: string) =>
    registerExtensionTask((extensions) => extensions.uninstallExtension(name)),
  );
  registerChannel(channels, 'extensions:getLog', async (_event, name: string) =>
    registerExtensionTask((extensions) => extensions.getExtensionLog(name)),
  );
  registerChannel(channels, 'extensions:openFolder', async () =>
    registerExtensionTask((extensions) => openExtensionsFolder(extensions)),
  );
  registerChannel(channels, 'extensions:activate', async (_event, name: string) =>
    registerExtensionTask((extensions) => extensions.forceActivateExtension(name)),
  );
  registerChannel(channels, 'extensions:commandExecuted', async (_event, commandId: string) =>
    registerExtensionTask(async (extensions) => {
      await extensions.dispatchCommandEvent(commandId);
      return ok();
    }),
  );
}
