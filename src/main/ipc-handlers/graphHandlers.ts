/**
 * graphHandlers.ts — Graph IPC handler registration.
 *
 * Split from miscRegistrars.ts to keep that file under the 300-line limit.
 */

import { ipcMain } from 'electron';

import { getGraphController } from '../codebaseGraph/graphController';

type ChannelList = string[];
type IpcHandler = Parameters<typeof ipcMain.handle>[1];

function reg(channels: ChannelList, channel: string, handler: IpcHandler): void {
  ipcMain.handle(channel, handler);
  channels.push(channel);
}

const GRAPH_NOT_INIT = { success: false as const, error: 'Graph not initialized' };
const GRAPH_CTRL_NOT_INIT = { success: false as const, error: 'Graph controller not initialized' };

function getCtrl() {
  return getGraphController();
}

function registerGraphQueryChannels(channels: ChannelList): void {
  reg(channels, 'graph:searchGraph', async (_event, query: string, limit?: number) => {
    const ctrl = getCtrl();
    if (!ctrl) return GRAPH_NOT_INIT;
    return { success: true as const, results: ctrl.searchGraph(query, limit) };
  });
  reg(channels, 'graph:queryGraph', async (_event, query: string) => {
    const ctrl = getCtrl();
    if (!ctrl) return GRAPH_NOT_INIT;
    return { success: true as const, results: ctrl.queryGraph(query) };
  });
  reg(
    channels,
    'graph:traceCallPath',
    async (_event, fromId: string, toId: string, maxDepth?: number) => {
      const ctrl = getCtrl();
      if (!ctrl) return GRAPH_NOT_INIT;
      return { success: true as const, result: ctrl.traceCallPath(fromId, toId, maxDepth) };
    },
  );
  reg(channels, 'graph:getArchitecture', async (_event, aspects?: string[]) => {
    const ctrl = getCtrl();
    if (!ctrl) return GRAPH_NOT_INIT;
    return { success: true as const, architecture: ctrl.getArchitecture(aspects) };
  });
}

function registerGraphReadChannels(channels: ChannelList): void {
  reg(channels, 'graph:getCodeSnippet', async (_event, symbolId: string) => {
    const ctrl = getCtrl();
    if (!ctrl) return GRAPH_NOT_INIT;
    return { success: true as const, snippet: await ctrl.getCodeSnippet(symbolId) };
  });
  reg(channels, 'graph:detectChanges', async () => {
    const ctrl = getCtrl();
    if (!ctrl) return GRAPH_NOT_INIT;
    return { success: true as const, changes: await ctrl.detectChanges() };
  });
  reg(
    channels,
    'graph:searchCode',
    async (_event, pattern: string, opts?: { fileGlob?: string; maxResults?: number }) => {
      const ctrl = getCtrl();
      if (!ctrl) return GRAPH_NOT_INIT;
      return { success: true as const, results: await ctrl.searchCode(pattern, opts) };
    },
  );
  reg(channels, 'graph:getGraphSchema', async () => {
    const ctrl = getCtrl();
    if (!ctrl) return GRAPH_NOT_INIT;
    return { success: true as const, schema: ctrl.getGraphSchema() };
  });
}

export function registerGraphHandlers(channels: ChannelList): void {
  reg(channels, 'graph:getStatus', async () => {
    const ctrl = getCtrl();
    if (!ctrl) return GRAPH_CTRL_NOT_INIT;
    return { success: true as const, status: ctrl.getStatus() };
  });
  reg(channels, 'graph:reindex', async () => {
    const ctrl = getCtrl();
    if (!ctrl) return GRAPH_CTRL_NOT_INIT;
    const context = ctrl.getGraphToolContext();
    if (!context) return { success: false as const, error: 'Graph not ready' };
    const result = await context.pipeline.index({
      projectRoot: context.projectRoot,
      projectName: context.projectName,
      incremental: false,
    });
    return { success: result.success, result };
  });
  registerGraphQueryChannels(channels);
  registerGraphReadChannels(channels);
}
