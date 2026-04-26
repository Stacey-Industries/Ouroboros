/**
 * internalMcpPortRegistry.ts — Stores the running internal MCP server port.
 *
 * Wave 48 Phase D: the scoped MCP config builder needs the ouroboros SSE URL
 * to write into the temp config file. The port is only known after the server
 * starts (port 0 = OS-assigned). main.ts calls setInternalMcpPort() once the
 * handle is resolved; orchestration callers read it via getInternalMcpUrl().
 */

let activePort: number | null = null;

export function setInternalMcpPort(port: number): void {
  activePort = port;
}

export function clearInternalMcpPort(): void {
  activePort = null;
}

/** Returns the ouroboros SSE URL, or null if the server is not running. */
export function getInternalMcpUrl(): string | null {
  if (activePort === null) return null;
  return `http://127.0.0.1:${activePort}/sse`;
}
