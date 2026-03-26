// Stub for mica-electron used in Vitest runs.
// The real package calls app.commandLine.appendSwitch() at module load time,
// which fails under Vitest's Node environment. This shim exports the same
// surface without touching Electron APIs.
// All method parameters intentionally begin with _ to signal they are unused stubs.
/* eslint-disable @typescript-eslint/no-unused-vars */

export class MicaBrowserWindow {
  constructor(_options?: Record<string, unknown>) {}
  loadURL(_url: string): Promise<void> { return Promise.resolve() }
  loadFile(_path: string): Promise<void> { return Promise.resolve() }
  show(): void {}
  hide(): void {}
  close(): void {}
  on(_event: string, _listener: (...args: unknown[]) => void): this { return this }
  once(_event: string, _listener: (...args: unknown[]) => void): this { return this }
  setVibrancy(_type: string | null): void {}
  setBackgroundMaterial(_material: string): void {}
  webContents = {
    send: (_channel: string, ..._args: unknown[]): void => {},
  }
}

export default { MicaBrowserWindow }
