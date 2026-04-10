/**
 * ptyHostProxyAgent.ts — Agent (Claude stream-json) PTY spawning via PtyHost.
 *
 * The agent bridge (NDJSON parser) lives in main and is fed by data events
 * from the PtyHost — same architecture as the direct ptyAgent.ts path, just
 * with PtyHost as the data source instead of node-pty directly.
 */

import type { BrowserWindow } from 'electron';

import type {
  StreamJsonEvent,
  StreamJsonResultEvent,
} from '../orchestration/providers/streamJsonTypes';
import type { AgentBridgeHandle } from '../ptyAgentBridge';
import { createAgentBridge } from '../ptyAgentBridge';
import type { PtySpawnInstruction } from './ptyHostProtocol';
import { registerAgentBridge, spawnViaPtyHost, writeViaPtyHost } from './ptyHostProxy';

export interface AgentBridgeSetup {
  bridge: AgentBridgeHandle;
  result: Promise<StreamJsonResultEvent | null>;
}

/**
 * Build the agent bridge with a result Promise that resolves when the bridge
 * sees a `result` event or when the session exits.
 */
export function createAgentBridgeWithResult(
  id: string,
  onEvent?: (event: StreamJsonEvent) => void,
): AgentBridgeSetup {
  let resolveResult!: (value: StreamJsonResultEvent | null) => void;
  let rejectResult!: (reason: unknown) => void;
  let settled = false;
  const result = new Promise<StreamJsonResultEvent | null>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  const bridge = createAgentBridge({
    sessionId: id,
    onEvent: (event) => onEvent?.(event),
    onComplete: (res, exitCode) => {
      if (settled) return;
      settled = true;
      if (res) resolveResult(res);
      else if (exitCode && exitCode !== 0) rejectResult(new Error(`Claude Code exited with code ${exitCode}`));
      else resolveResult(null);
    },
  });
  const originalDispose = bridge.dispose.bind(bridge);
  bridge.dispose = (): void => {
    if (!settled) {
      settled = true;
      resolveResult(null);
    }
    originalDispose();
  };
  return { bridge, result };
}

export interface SpawnAgentResult {
  success: boolean;
  error?: string;
  bridge?: AgentBridgeHandle;
  result?: Promise<StreamJsonResultEvent | null>;
}

/**
 * Spawn an agent session via PtyHost with the bridge attached in main.
 *
 * After the spawn IPC round-trip completes, we register the bridge as the
 * data feeder for this session and write the prompt + EOF (delayed by 150ms
 * to match the direct ptyAgent.ts behavior).
 */
export async function spawnAgentViaPtyHost(
  instruction: PtySpawnInstruction,
  win: BrowserWindow,
  prompt: string,
  onEvent?: (event: StreamJsonEvent) => void,
): Promise<SpawnAgentResult> {
  const spawnRes = await spawnViaPtyHost(instruction, win);
  if (!spawnRes.success) return { success: false, ...(spawnRes.error ? { error: spawnRes.error } : {}) };
  const { bridge, result } = createAgentBridgeWithResult(instruction.id, onEvent);
  registerAgentBridge(instruction.id, bridge);
  // Match the 150ms delay from direct ptyAgent.ts — gives the shell a moment
  // to be ready before we push the prompt.
  const eofChar = process.platform === 'win32' ? '\x1a' : '\x04';
  setTimeout(() => {
    writeViaPtyHost(instruction.id, prompt);
    writeViaPtyHost(instruction.id, eofChar);
  }, 150);
  return { success: true, bridge, result };
}
