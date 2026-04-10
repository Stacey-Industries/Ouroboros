/**
 * mcpHostProxy.ts — Main-process proxy that fronts the McpHost utility process.
 *
 * Lazily forks the host on first start. Receives toolListRequest and
 * toolCallRequest events from the host and dispatches them to the existing
 * tool registry in main (`getActiveTools` / `findTool`). Tool handlers run
 * in main because they need the graph controller and context layer store.
 *
 * Behavior is gated by the `useMcpHost` config flag. When off, main.ts uses
 * the direct in-process internalMcpServer and this module is never instantiated.
 */

import path from 'path';

import { findTool, getActiveTools } from '../internalMcp/internalMcpTools';
import log from '../logger';
import { UtilityProcessHost } from '../utilityProcessHost';
import type {
  McpHostEvent,
  McpHostOutbound,
  McpHostRequest,
  McpHostResponse,
} from './mcpHostProtocol';
import { isEvent } from './mcpHostProtocol';

let host: UtilityProcessHost<McpHostRequest, McpHostOutbound> | null = null;
let workspaceRoot = '';

function resolveModulePath(): string {
  const outMainDir = __dirname.endsWith('chunks') ? path.dirname(__dirname) : __dirname;
  return path.join(outMainDir, 'mcpHostMain.js');
}

function getHost(): UtilityProcessHost<McpHostRequest, McpHostOutbound> {
  if (host && host.alive) return host;
  host = new UtilityProcessHost<McpHostRequest, McpHostOutbound>({
    name: 'mcpHost',
    modulePath: resolveModulePath(),
    autoRestart: false,  // McpHost is stateless — restart is owned by main
  });
  host.fork();
  host.onEvent((msg) => {
    if (isEvent(msg)) handleEvent(msg);
  });
  return host;
}

// ── Event handlers (host → main → tool dispatch) ──

function handleEvent(event: McpHostEvent): void {
  switch (event.type) {
    case 'toolListRequest': handleToolListRequest(event.callId); return;
    case 'toolCallRequest': void handleToolCallRequest(event.callId, event.name, event.args); return;
  }
}

function handleToolListRequest(callId: string): void {
  if (!host || !host.alive) return;
  try {
    const tools = getActiveTools().map((t) => ({
      name: t.name, description: t.description, inputSchema: t.inputSchema,
    }));
    host.send({ type: 'toolListResponse', callId, tools });
  } catch (err) {
    log.warn('[mcpHostProxy] toolListRequest error:', err);
    host.send({ type: 'toolListResponse', callId, tools: [] });
  }
}

async function handleToolCallRequest(
  callId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<void> {
  if (!host || !host.alive) return;
  const tool = findTool(name);
  if (!tool) {
    host.send({ type: 'toolCallResponse', callId, text: `Unknown tool: ${name}`, isError: true });
    return;
  }
  try {
    const text = await tool.handler(args, workspaceRoot);
    host.send({ type: 'toolCallResponse', callId, text, isError: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    host.send({ type: 'toolCallResponse', callId, text: `Error: ${message}`, isError: true });
  }
}

// ── Public API ──

/** Start the McpHost server. Returns the actual port (the host may pick a random one). */
export async function startMcpHost(
  workspace: string,
  port = 0,
): Promise<{ success: boolean; port?: number; error?: string }> {
  try {
    const h = getHost();
    workspaceRoot = workspace;
    const requestId = h.nextRequestId();
    const res = await h.request<McpHostResponse & { type: 'started' }>(
      { type: 'start', requestId, workspaceRoot: workspace, port },
    );
    return { success: true, port: res.port };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Stop the McpHost server gracefully. */
export async function stopMcpHost(): Promise<void> {
  if (!host || !host.alive) return;
  try {
    const requestId = host.nextRequestId();
    await host.request<McpHostResponse>({ type: 'stop', requestId });
  } catch (err) {
    log.warn('[mcpHostProxy] stop error:', err);
  }
}

/** Kill the McpHost utility process entirely. Called from app shutdown. */
export async function shutdownMcpHost(): Promise<void> {
  if (!host) return;
  await host.kill();
  host = null;
  workspaceRoot = '';
}

/** Test-only reset. */
export function _resetForTests(): void {
  host = null;
  workspaceRoot = '';
}
