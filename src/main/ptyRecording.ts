import { BrowserWindow, dialog } from 'electron'
import fs from 'fs/promises'

import type { PtySession } from './pty'
import { broadcastToWebClients } from './web/webServer'

export interface AsciicastEvent {
  time: number
  data: string
}

export interface RecordingState {
  startTime: number
  startTimeSec: number
  events: AsciicastEvent[]
  cols: number
  rows: number
  dataCleanup: (() => void) | null
}

function buildAsciicastContent(recording: RecordingState): string {
  const header = JSON.stringify({
    version: 2,
    width: recording.cols,
    height: recording.rows,
    timestamp: recording.startTimeSec,
    title: 'Terminal Recording',
  })

  const eventLines = recording.events.map((event) =>
    JSON.stringify([parseFloat(event.time.toFixed(6)), 'o', event.data])
  )

  return [header, ...eventLines].join('\n') + '\n'
}

export function startPtyRecording(
  id: string,
  sessions: Map<string, PtySession>,
  recordings: Map<string, RecordingState>,
  win: BrowserWindow
): { success: boolean; error?: string } {
  const session = sessions.get(id)
  if (!session) {
    return { success: false, error: `Session ${id} not found` }
  }
  if (recordings.has(id)) {
    return { success: false, error: `Session ${id} is already recording` }
  }

  const now = Date.now()
  const dataDisposable = session.process.onData((data: string) => {
    const recording = recordings.get(id)
    if (!recording) {
      return
    }
    recording.events.push({ time: (Date.now() - recording.startTime) / 1000, data })
  })

  recordings.set(id, {
    startTime: now,
    startTimeSec: Math.floor(now / 1000),
    events: [],
    cols: session.process.cols,
    rows: session.process.rows,
    dataCleanup: () => dataDisposable.dispose(),
  })

  if (!win.isDestroyed()) {
    win.webContents.send(`pty:recordingState:${id}`, { recording: true })
  }
  broadcastToWebClients(`pty:recordingState:${id}`, { recording: true })
  return { success: true }
}

export async function stopPtyRecording(
  id: string,
  recordings: Map<string, RecordingState>,
  win: BrowserWindow
): Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }> {
  const recording = recordings.get(id)
  if (!recording) {
    return { success: false, error: `Session ${id} is not recording` }
  }

  recording.dataCleanup?.()
  recordings.delete(id)
  if (!win.isDestroyed()) {
    win.webContents.send(`pty:recordingState:${id}`, { recording: false })
  }
  broadcastToWebClients(`pty:recordingState:${id}`, { recording: false })

  try {
    const result = await dialog.showSaveDialog(win, {
      title: 'Save Terminal Recording',
      defaultPath: `terminal-recording-${Date.now()}.cast`,
      filters: [
        { name: 'Asciicast', extensions: ['cast'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })

    if (result.canceled || !result.filePath) {
      return { success: true, cancelled: true }
    }

    await fs.writeFile(result.filePath, buildAsciicastContent(recording), 'utf-8')
    return { success: true, filePath: result.filePath }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
