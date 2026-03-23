import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

import { getDiagnostics } from './lsp';
import { getActiveSessions } from './pty';

export type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;

interface ToolHandlerDeps {
  queryRenderer: (method: string, params?: unknown) => Promise<unknown>;
  execGitStatus: (cwd?: string) => Promise<Record<string, unknown>>;
}

type ToolHandlers = Record<string, ToolHandler>;

export function execGitStatus(cwd?: string): Promise<Record<string, unknown>> {
  const workdir = cwd || process.cwd();

  return new Promise((resolve) => {
    execFile(
      'git',
      ['status', '--porcelain=v1', '-uall'],
      { cwd: workdir, timeout: 10_000, maxBuffer: 512 * 1024 },
      (err, stdout) => {
        if (err) {
          resolve({ error: err.message, files: {} });
          return;
        }

        const files: Record<string, string> = {};
        for (const line of stdout.split('\n')) {
          if (!line.trim()) continue;
          const status = line.substring(0, 2).trim();
          const filePath = line.substring(3).trim();
          // eslint-disable-next-line security/detect-object-injection -- filePath comes from trusted git output
          if (filePath) files[filePath] = status;
        }

        execFile(
          'git',
          ['branch', '--show-current'],
          { cwd: workdir, timeout: 5_000 },
          (branchErr, branchOut) => {
            resolve({
              branch: branchErr ? 'unknown' : branchOut.trim(),
              files,
              cwd: workdir,
            });
          },
        );
      },
    );
  });
}

function createRendererHandler(
  queryRenderer: ToolHandlerDeps['queryRenderer'],
  method: string,
  mapParams?: (params: Record<string, unknown>) => unknown,
): ToolHandler {
  return async (params) => queryRenderer(method, mapParams ? mapParams(params) : undefined);
}

function requireStringParam(params: Record<string, unknown>, key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- key is a string literal from trusted internal callers
  const value = params[key];
  if (typeof value === 'string' && value) return value;
  throw new Error(`Missing required param: ${key}`);
}

async function getUnsavedContent(
  queryRenderer: ToolHandlerDeps['queryRenderer'],
  filePath: string,
): Promise<unknown> {
  try {
    return await queryRenderer('getUnsavedContent', { path: filePath });
  } catch {
    return null;
  }
}

function createGetFileContentHandler(queryRenderer: ToolHandlerDeps['queryRenderer']): ToolHandler {
  return async (params) => {
    const filePath = requireStringParam(params, 'path');
    const unsaved = await getUnsavedContent(queryRenderer, filePath);

    if (unsaved) {
      return { path: filePath, content: unsaved, unsaved: true };
    }

    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath is validated by the caller as a string param
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return { path: filePath, content, unsaved: false };
    } catch (err) {
      throw new Error(`Cannot read file: ${(err as Error).message}`);
    }
  };
}

async function resolveDiagnosticsRoot(
  queryRenderer: ToolHandlerDeps['queryRenderer'],
  filePath: string,
): Promise<string> {
  try {
    const info = (await queryRenderer('getProjectInfo')) as { root?: string };
    return info?.root || path.dirname(filePath);
  } catch {
    return path.dirname(filePath);
  }
}

function createGetDiagnosticsHandler(queryRenderer: ToolHandlerDeps['queryRenderer']): ToolHandler {
  return async (params) => {
    const filePath = params.path as string | undefined;
    if (!filePath) {
      return queryRenderer('getAllDiagnostics');
    }

    const root = await resolveDiagnosticsRoot(queryRenderer, filePath);
    return getDiagnostics(root, filePath);
  };
}

export function createToolHandlers({
  queryRenderer,
  execGitStatus,
}: ToolHandlerDeps): ToolHandlers {
  return {
    'ide.getOpenFiles': createRendererHandler(queryRenderer, 'getOpenFiles'),
    'ide.getActiveFile': createRendererHandler(queryRenderer, 'getActiveFile'),
    'ide.getFileContent': createGetFileContentHandler(queryRenderer),
    'ide.getGitStatus': async (params) => execGitStatus(params.cwd as string | undefined),
    'ide.getSelection': createRendererHandler(queryRenderer, 'getSelection'),
    'ide.getProjectInfo': createRendererHandler(queryRenderer, 'getProjectInfo'),
    'ide.getDiagnostics': createGetDiagnosticsHandler(queryRenderer),
    'ide.getTerminalOutput': createRendererHandler(
      queryRenderer,
      'getTerminalOutput',
      (params) => ({
        sessionId: params.sessionId as string | undefined,
        lines: (params.lines as number) || 50,
      }),
    ),
    'ide.getActiveSessions': async () => getActiveSessions(),
    'ide.ping': async () => ({
      status: 'ok',
      timestamp: Date.now(),
      version: 'ouroboros-tools/1.0',
    }),
  };
}
