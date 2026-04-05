/**
 * filesHelpers.ts — File operation implementation helpers.
 *
 * Extracted from files.ts to keep each file under 300 lines.
 */

import { randomUUID } from 'crypto';
import { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import type { Dirent } from 'fs';
import fs from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

import { getGraphController } from '../codebaseGraph/graphController';
import { getContextLayerController } from '../contextLayer/contextLayerController';
import { dispatchFileOpenEvent } from '../extensions';
import log from '../logger';
import { broadcastToWebClients } from '../web/webServer';
import { invalidateSnapshotCache as invalidateAgentChatCache } from './agentChat';

export const MAX_READ_BYTES = 100 * 1024 * 1024;

export function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function toErrorResult(err: unknown): { success: false; error: string } {
  return { success: false, error: toErrorMessage(err) };
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export function createDirItem(dirPath: string, entry: Dirent) {
  return {
    name: entry.name,
    path: path.join(dirPath, entry.name),
    isDirectory: entry.isDirectory(),
    isFile: entry.isFile(),
    isSymlink: entry.isSymbolicLink(),
  };
}

export async function ensureDirExists(dirPath: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- directory paths are derived from validated file paths
  await fs.mkdir(dirPath, { recursive: true });
}

export async function movePath(sourcePath: string, destPath: string): Promise<void> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- both paths are validated before use
    await fs.rename(sourcePath, destPath);
  } catch (err: unknown) {
    if (!isRenameFallbackError(err)) throw err;
    // fs.rename fails on Windows with EPERM (locked files) or EXDEV (cross-volume).
    // Fall back to recursive copy + remove.

    await fs.cp(sourcePath, destPath, { recursive: true });

    await fs.rm(sourcePath, { recursive: true, force: true });
  }
}

function isRenameFallbackError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code;
  return code === 'EPERM' || code === 'EXDEV';
}

export function mimeTypeForImage(ext: string): string {
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/png';
  }
}

export async function loadImageAttachment(
  filePath: string,
): Promise<{ name: string; mimeType: string; base64Data: string; sizeBytes: number }> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath comes from the open-file dialog
  const buf = await fs.readFile(filePath);
  if (buf.byteLength > 5 * 1024 * 1024) {
    throw new Error(`${path.basename(filePath)} exceeds the 5 MB attachment limit.`);
  }
  const ext = path.extname(filePath).toLowerCase().slice(1);
  return {
    name: path.basename(filePath),
    mimeType: mimeTypeForImage(ext),
    base64Data: buf.toString('base64'),
    sizeBytes: buf.byteLength,
  };
}

export function isTempDeletionPath(tempPath: string): boolean {
  const normalizedTemp = path.resolve(tempPath);
  const expectedPrefix = path.resolve(tmpdir(), 'agent-ide-deleted');
  return normalizedTemp === expectedPrefix || normalizedTemp.startsWith(expectedPrefix + path.sep);
}

export async function loadTextContent(
  filePath: string,
): Promise<{ success: true; content: string }> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath is validated before this helper runs
  return { success: true, content: await fs.readFile(filePath, 'utf-8') };
}

export async function loadBinaryContent(
  filePath: string,
): Promise<{ success: true; data: Buffer }> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath is validated before this helper runs
  return { success: true, data: await fs.readFile(filePath) };
}

export async function listDirectoryItems(
  dirPath: string,
): Promise<{ success: true; items: ReturnType<typeof createDirItem>[] }> {
  return {
    success: true,
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dirPath is validated before this helper runs
    items: (await fs.readdir(dirPath, { withFileTypes: true })).map((entry) =>
      createDirItem(dirPath, entry),
    ),
  };
}

export async function createExclusiveFile(
  filePath: string,
  content?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  await ensureDirExists(path.dirname(filePath));
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath is validated before this helper runs
  const handle = await fs.open(filePath, 'wx');
  try {
    await handle.writeFile(content ?? '', 'utf-8');
    return { success: true };
  } finally {
    await handle.close();
  }
}

export async function writeBinaryFile(
  filePath: string,
  data: Uint8Array,
): Promise<{ success: true }> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath is validated before this helper runs
  await fs.writeFile(filePath, data);
  return { success: true };
}

export async function writeTextFile(filePath: string, content: string): Promise<{ success: true }> {
  log.debug(
    `[writeTextFile] path=${filePath} contentLength=${content.length} first80=${JSON.stringify(content.slice(0, 80))}`,
  );
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath is validated before this helper runs
  await fs.writeFile(filePath, content, 'utf-8');
  log.debug(`[writeTextFile] write complete for ${filePath}`);
  return { success: true };
}

export function broadcastFileChange(type: string, filePath: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      try {
        // Use mainFrame.send directly — webContents.send logs internally before
        // rethrowing when the render frame is disposed during HMR/navigation.
        window.webContents.mainFrame.send('files:change', { type, path: filePath });
      } catch {
        // Render frame disposed — silently skip this window
      }
    }
  }
  broadcastToWebClients('files:change', { type, path: filePath });
  getContextLayerController()?.onFileChange(type, filePath);
  invalidateAgentChatCache();
  const graphCtrl = getGraphController();
  if (graphCtrl) graphCtrl.onFileChange([filePath]);
}

export async function readFileWithLimit<T extends object>(
  event: IpcMainInvokeEvent,
  filePath: string,
  load: () => Promise<T>,
  assertPathAllowed: (
    event: IpcMainInvokeEvent,
    p: string,
  ) => { success: false; error: string } | null,
): Promise<T | { success: false; error: string }> {
  const denied = assertPathAllowed(event, filePath);
  if (denied) return denied;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path validated by assertPathAllowed
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_READ_BYTES) {
      return {
        success: false,
        error: `File too large (${Math.round(stat.size / 1024 / 1024)} MB). Maximum is 100 MB.`,
      };
    }
    const result = await load();
    dispatchFileOpenEvent(filePath).catch(() => {});
    return result;
  } catch (err) {
    return toErrorResult(err);
  }
}

export async function handleSoftDeleteOp(
  targetPath: string,
): Promise<{ success: true; tempPath: string }> {
  const tempDir = path.join(tmpdir(), 'agent-ide-deleted');
  await ensureDirExists(tempDir);
  const tempPath = path.join(tempDir, randomUUID());
  await movePath(targetPath, tempPath);
  return { success: true, tempPath };
}
