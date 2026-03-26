import {
  DidChangeTextDocumentNotification,
  DidCloseTextDocumentNotification,
  DidOpenTextDocumentNotification,
} from 'vscode-languageserver-protocol';

// vscode-languageserver-protocol ProtocolNotificationType has extra generic params
// that make it incompatible with vscode-jsonrpc NotificationType. Use method strings.
const LSP_DID_OPEN = DidOpenTextDocumentNotification.type.method;
const LSP_DID_CHANGE = DidChangeTextDocumentNotification.type.method;
const LSP_DID_CLOSE = DidCloseTextDocumentNotification.type.method;

import { filePathToUri, languageIdFromPath } from './lspHelpers';
import { getRunningServerForFile } from './lspState';

export async function didOpen(root: string, filePath: string, content: string): Promise<void> {
  const server = getRunningServerForFile(root, filePath);
  if (!server) {
    return;
  }

  const uri = filePathToUri(filePath);
  server.instance.documentVersions.set(uri, 1);
  server.instance.connection.sendNotification(LSP_DID_OPEN, {
    textDocument: {
      uri,
      languageId: languageIdFromPath(filePath),
      version: 1,
      text: content,
    },
  });
}

export async function didChange(root: string, filePath: string, content: string): Promise<void> {
  const server = getRunningServerForFile(root, filePath);
  if (!server) {
    return;
  }

  const uri = filePathToUri(filePath);
  const version = (server.instance.documentVersions.get(uri) ?? 0) + 1;
  server.instance.documentVersions.set(uri, version);
  server.instance.connection.sendNotification(LSP_DID_CHANGE, {
    textDocument: { uri, version },
    contentChanges: [{ text: content }],
  });
}

export async function didClose(root: string, filePath: string): Promise<void> {
  const server = getRunningServerForFile(root, filePath);
  if (!server) {
    return;
  }

  const uri = filePathToUri(filePath);
  server.instance.documentVersions.delete(uri);
  server.instance.connection.sendNotification(LSP_DID_CLOSE, {
    textDocument: { uri },
  });
}
