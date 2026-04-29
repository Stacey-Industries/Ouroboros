/**
 * internalMcpPortRegistry.ts — Stores the running internal MCP server port.
 *
 * Wave 48 Phase D: the scoped MCP config builder needs the ouroboros SSE URL
 * to write into the temp config file. The port is only known after the server
 * starts (port 0 = OS-assigned). main.ts calls setInternalMcpPort() once the
 * handle is resolved; orchestration callers read it via getInternalMcpUrl().
 *
 * Wave 53l Phase A+ (Fix A): port is also persisted to
 * `~/.claude/internalMcp-port.json` so the standalone stdio→SSE bridge can
 * resolve the live port at spawn time. Pre-Fix-A the port was baked into the
 * stdio entry's args, which went stale across IDE restarts (port:0 picks a
 * random port every launch) and caused the codemode proxy to spawn the
 * bridge with a dead port → ECONNREFUSED → upstream registered as 0 servers.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

let activePort: number | null = null;

const PORT_FILE = path.join(os.homedir(), '.claude', 'internalMcp-port.json');

export function getPortFilePath(): string {
  return PORT_FILE;
}

export function setInternalMcpPort(port: number): void {
  activePort = port;
  void writePortFile(port);
}

export function clearInternalMcpPort(): void {
  activePort = null;
  void deletePortFile();
}

/** Returns the ouroboros SSE URL, or null if the server is not running. */
export function getInternalMcpUrl(): string | null {
  if (activePort === null) return null;
  return `http://127.0.0.1:${activePort}/sse`;
}

interface PortFile {
  port: number;
  pid: number;
  updatedAt: number;
}

async function writePortFile(port: number): Promise<void> {
  try {
    const dir = path.dirname(PORT_FILE);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- known constant path under homedir
    await fs.promises.mkdir(dir, { recursive: true });
    const data: PortFile = { port, pid: process.pid, updatedAt: Date.now() };
    const tmp = `${PORT_FILE}.tmp`;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- known constant path under homedir
    await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- known constant path under homedir
    await fs.promises.rename(tmp, PORT_FILE);
  } catch {
    // Non-fatal — orchestration callers fall back to in-memory state.
  }
}

async function deletePortFile(): Promise<void> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- known constant path under homedir
    await fs.promises.unlink(PORT_FILE);
  } catch {
    // Already gone — fine.
  }
}

/**
 * Synchronous port-file reader. Used by `internalMcpStdioTransport.ts` (the
 * bridge) at spawn time — it has no access to the in-memory `activePort`
 * because it runs in a separate process. Returns null on any read/parse
 * error so the caller can decide whether to fail or fall back.
 */
export function readPortFileSync(): number | null {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- known constant path under homedir
    const raw = fs.readFileSync(PORT_FILE, 'utf-8');
    const data = JSON.parse(raw) as Partial<PortFile>;
    if (typeof data.port !== 'number' || data.port <= 0 || data.port > 65535) return null;
    return data.port;
  } catch {
    return null;
  }
}
