import {
  type CompletionItem as ProtocolCompletionItem,
  type CompletionList,
  CompletionRequest,
  DefinitionRequest,
  HoverRequest,
} from 'vscode-languageserver-protocol';

import {
  filePathToUri,
  getFirstLocation,
  normalizeCompletionResult,
  normalizeHoverContents,
  uriToFilePath,
} from './lspHelpers';
import { getRunningServerForFile } from './lspState';
import type { CompletionItem, LspActionResult, LspDiagnostic, LspLocation } from './lspTypes';

interface ServerLookup {
  instance: NonNullable<ReturnType<typeof getRunningServerForFile>>['instance'];
  language: string;
}

function getQueryServer(root: string, filePath: string): ServerLookup | null {
  return getRunningServerForFile(root, filePath);
}

function getMissingServerError(root: string, filePath: string): LspActionResult {
  const lookup = getRunningServerForFile(root, filePath);
  if (lookup) {
    return { success: false, error: `Language server for ${lookup.language} is not running` };
  }
  return { success: false, error: 'No language server for this file type' };
}

export async function getCompletion(
  root: string,
  filePath: string,
  line: number,
  character: number,
): Promise<{ success: boolean; items?: CompletionItem[]; error?: string }> {
  const server = getQueryServer(root, filePath);
  if (!server) {
    return getMissingServerError(root, filePath);
  }

  try {
    const result = await server.instance.connection.sendRequest(CompletionRequest.type, {
      textDocument: { uri: filePathToUri(filePath) },
      position: { line, character },
    });
    return {
      success: true,
      items: normalizeCompletionResult(result as ProtocolCompletionItem[] | CompletionList | null),
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getHover(
  root: string,
  filePath: string,
  line: number,
  character: number,
): Promise<{ success: boolean; contents?: string; error?: string }> {
  const server = getQueryServer(root, filePath);
  if (!server) {
    return getMissingServerError(root, filePath);
  }

  try {
    const result = await server.instance.connection.sendRequest(HoverRequest.type, {
      textDocument: { uri: filePathToUri(filePath) },
      position: { line, character },
    });
    return {
      success: true,
      contents: result ? normalizeHoverContents(result.contents) : '',
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function getDefinition(
  root: string,
  filePath: string,
  line: number,
  character: number,
): Promise<{ success: boolean; location?: LspLocation; error?: string }> {
  const server = getQueryServer(root, filePath);
  if (!server) {
    return getMissingServerError(root, filePath);
  }

  try {
    const result = await server.instance.connection.sendRequest(DefinitionRequest.type, {
      textDocument: { uri: filePathToUri(filePath) },
      position: { line, character },
    });
    const location = getFirstLocation(result ?? null);
    if (!location) {
      return { success: true };
    }
    return {
      success: true,
      location: {
        filePath: uriToFilePath(location.uri),
        line: location.range.start.line,
        character: location.range.start.character,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function getDiagnostics(
  root: string,
  filePath: string,
): { success: boolean; diagnostics?: LspDiagnostic[]; error?: string } {
  const server = getQueryServer(root, filePath);
  if (!server) {
    return getMissingServerError(root, filePath);
  }

  const diagnostics = server.instance.diagnosticsCache.get(filePathToUri(filePath)) ?? [];
  return { success: true, diagnostics };
}
