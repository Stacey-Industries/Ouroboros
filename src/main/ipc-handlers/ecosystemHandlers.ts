/**
 * ecosystemHandlers.ts — IPC handlers for Wave 37 Phase B (ecosystem moat).
 *
 * Registers the push-only `ecosystem:promptDiff` channel catalog entry.
 * The actual emit comes from promptDiffScheduler.ts — this module only
 * exposes the subscribe side to the renderer and returns the channel list
 * so ipc.ts can track it.
 *
 * Channel catalog: ecosystem:promptDiff — class paired-read, timeout short.
 */

export function registerEcosystemHandlers(): string[] {
  // ecosystem:promptDiff is push-only (main → renderer via webContents.send).
  // No ipcMain.handle is needed — the renderer subscribes via preload onChannel.
  // We return the channel name so ipc.ts can log it in the registered list.
  return ['ecosystem:promptDiff']
}
