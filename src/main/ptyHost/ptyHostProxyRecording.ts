/**
 * ptyHostProxyRecording.ts — PTY recording for the PtyHost path.
 *
 * Recording state and disk I/O live in the main process. As `data` events
 * arrive from PtyHost (via ptyHostProxy.handleData), we incrementally append
 * Asciicast event lines to a temp file. On stop, we show the save dialog and
 * copy the temp file to the user's chosen path. Bounded memory regardless of
 * recording length.
 *
 * Format reference: https://docs.asciinema.org/manual/asciicast/v2/
 */

import { type BrowserWindow, dialog } from 'electron';
import { createWriteStream, type WriteStream } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import log from '../logger';
import { broadcastToWebClients } from '../web/webServer';
import { getProxySession } from './ptyHostProxy';

interface ActiveRecording {
  startTime: number;
  cols: number;
  rows: number;
  tempPath: string;
  stream: WriteStream;
}

const recordings = new Map<string, ActiveRecording>();

function tempPathFor(id: string): string {
  // Sanitize id for use in a filename — strip path separators and control chars.
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(os.tmpdir(), `ouroboros-recording-${safe}-${Date.now()}.cast`);
}

function buildHeader(cols: number, rows: number, startTime: number): string {
  return JSON.stringify({
    version: 2,
    width: cols,
    height: rows,
    timestamp: Math.floor(startTime / 1000),
    title: 'Terminal Recording',
  }) + '\n';
}

/** Called from ptyHostProxy.handleData for every PTY data chunk. */
export function feedRecordingFrame(id: string, data: string): void {
  const recording = recordings.get(id);
  if (!recording) return;
  const time = (Date.now() - recording.startTime) / 1000;
  const eventLine = JSON.stringify([parseFloat(time.toFixed(6)), 'o', data]) + '\n';
   
  recording.stream.write(eventLine);
}

/**
 * Start recording for a session. Opens a temp file, writes the header, and
 * sets up the data hook (already wired via handleData → feedRecordingFrame).
 */
export function startRecordingViaPtyHost(
  id: string,
  cols: number,
  rows: number,
  win: BrowserWindow,
): { success: boolean; error?: string } {
  if (recordings.has(id)) {
    return { success: false, error: `Session ${id} is already recording` };
  }
  const session = getProxySession(id);
  if (!session) {
    return { success: false, error: `Session ${id} not found` };
  }
  const startTime = Date.now();
  const tempPath = tempPathFor(id);
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- tempPath built from sanitized id + os.tmpdir()
    const stream = createWriteStream(tempPath, { encoding: 'utf-8' });
    stream.on('error', (err) => {
      log.warn(`[recording ${id}] write stream error:`, err);
    });
    stream.write(buildHeader(cols, rows, startTime));
    recordings.set(id, { startTime, cols, rows, tempPath, stream });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!win.isDestroyed()) {
    win.webContents.send(`pty:recordingState:${id}`, { recording: true });
  }
  broadcastToWebClients(`pty:recordingState:${id}`, { recording: true });
  return { success: true };
}

/**
 * Stop recording, close the stream, prompt for save destination, and copy the
 * temp file to the user's chosen path. Cleans up the temp file in all cases.
 */
export async function stopRecordingViaPtyHost(
  id: string,
  win: BrowserWindow,
): Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }> {
  const recording = recordings.get(id);
  if (!recording) return { success: false, error: `Session ${id} is not recording` };
  recordings.delete(id);
  await closeStream(recording.stream);
  if (!win.isDestroyed()) {
    win.webContents.send(`pty:recordingState:${id}`, { recording: false });
  }
  broadcastToWebClients(`pty:recordingState:${id}`, { recording: false });

  try {
    const result = await dialog.showSaveDialog(win, {
      title: 'Save Terminal Recording',
      defaultPath: `terminal-recording-${Date.now()}.cast`,
      filters: [
        { name: 'Asciicast', extensions: ['cast'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePath) {
      await deleteTempFile(recording.tempPath);
      return { success: true, cancelled: true };
    }
     
    await fs.copyFile(recording.tempPath, result.filePath);
    await deleteTempFile(recording.tempPath);
    return { success: true, filePath: result.filePath };
  } catch (error) {
    await deleteTempFile(recording.tempPath);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function closeStream(stream: WriteStream): Promise<void> {
  return new Promise((resolve) => {
    stream.end(() => resolve());
  });
}

async function deleteTempFile(tempPath: string): Promise<void> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- tempPath built internally
    await fs.unlink(tempPath);
  } catch {
    // Already gone — ignore.
  }
}

/** Called on PtyHost crash or session exit — abandon any in-progress recording. */
export function abortRecording(id: string): void {
  const recording = recordings.get(id);
  if (!recording) return;
  recordings.delete(id);
  recording.stream.end();
  void deleteTempFile(recording.tempPath);
}
