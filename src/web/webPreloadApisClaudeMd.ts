/**
 * webPreloadApisClaudeMd.ts — claudeMd API namespace builder for web preload shim.
 * Exports: buildClaudeMdApi.
 */

import type {
  ClaudeMdGenerateDirResult,
  ClaudeMdGenerateResult,
  ClaudeMdGenerationStatus,
  ClaudeMdStatusResult,
} from '../renderer/types/electron-claude-md';
import type { WebSocketTransport } from './webPreloadTransport';

// ─── ClaudeMd API ─────────────────────────────────────────────────────────────

export function buildClaudeMdApi(t: WebSocketTransport) {
  return {
    generate: (
      projectRoot: string,
      options?: { fullSweep?: boolean },
    ): Promise<ClaudeMdGenerateResult> =>
      t.invoke('claudeMd:generate', projectRoot, options) as Promise<ClaudeMdGenerateResult>,

    generateForDir: (
      projectRoot: string,
      dirPath: string,
    ): Promise<ClaudeMdGenerateDirResult> =>
      t.invoke('claudeMd:generateForDir', projectRoot, dirPath) as Promise<ClaudeMdGenerateDirResult>,

    getStatus: (): Promise<ClaudeMdStatusResult> =>
      t.invoke('claudeMd:getStatus') as Promise<ClaudeMdStatusResult>,

    onStatusChange: (callback: (status: ClaudeMdGenerationStatus) => void): (() => void) =>
      t.on('claudeMd:statusChange', callback as (v: unknown) => void),
  };
}
