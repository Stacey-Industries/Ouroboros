import path from 'path';
import {
  type CompletionItem as ProtocolCompletionItem,
  CompletionItemKind,
  type CompletionList,
  type Diagnostic,
  DiagnosticSeverity,
  type Location,
  type LocationLink,
  type MarkupContent,
} from 'vscode-languageserver-protocol';

import { getConfigValue } from './config';
import type { CompletionItem, LspDiagnostic } from './lspTypes';

export interface ServerCommand {
  command: string;
  args: string[];
}

const DEFAULT_SERVER_COMMANDS: Record<string, ServerCommand> = {
  typescript: { command: 'typescript-language-server', args: ['--stdio'] },
  javascript: { command: 'typescript-language-server', args: ['--stdio'] },
  python: { command: 'pylsp', args: [] },
  rust: { command: 'rust-analyzer', args: [] },
  go: { command: 'gopls', args: ['serve'] },
  css: { command: 'vscode-css-language-server', args: ['--stdio'] },
  html: { command: 'vscode-html-language-server', args: ['--stdio'] },
  json: { command: 'vscode-json-language-server', args: ['--stdio'] },
};

const LANGUAGE_ID_BY_EXTENSION: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.css': 'css',
  '.html': 'html',
  '.json': 'json',
  '.md': 'markdown',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.java': 'java',
  '.rb': 'ruby',
  '.php': 'php',
  '.sh': 'shellscript',
  '.bash': 'shellscript',
  '.sql': 'sql',
  '.xml': 'xml',
};

const SERVER_LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.css': 'css',
  '.html': 'html',
  '.json': 'json',
};

const COMPLETION_KIND_MAP = new Map<number, string>([
  [CompletionItemKind.Text, 'text'],
  [CompletionItemKind.Method, 'method'],
  [CompletionItemKind.Function, 'function'],
  [CompletionItemKind.Constructor, 'constructor'],
  [CompletionItemKind.Field, 'field'],
  [CompletionItemKind.Variable, 'variable'],
  [CompletionItemKind.Class, 'class'],
  [CompletionItemKind.Interface, 'interface'],
  [CompletionItemKind.Module, 'module'],
  [CompletionItemKind.Property, 'property'],
  [CompletionItemKind.Unit, 'unit'],
  [CompletionItemKind.Value, 'value'],
  [CompletionItemKind.Enum, 'enum'],
  [CompletionItemKind.Keyword, 'keyword'],
  [CompletionItemKind.Snippet, 'snippet'],
  [CompletionItemKind.Color, 'color'],
  [CompletionItemKind.File, 'file'],
  [CompletionItemKind.Reference, 'reference'],
  [CompletionItemKind.Folder, 'folder'],
  [CompletionItemKind.EnumMember, 'enumMember'],
  [CompletionItemKind.Constant, 'constant'],
  [CompletionItemKind.Struct, 'struct'],
  [CompletionItemKind.Event, 'event'],
  [CompletionItemKind.Operator, 'operator'],
  [CompletionItemKind.TypeParameter, 'typeParameter'],
]);

export function serverKey(root: string, language: string): string {
  return `${root}::${language}`;
}

export function filePathToUri(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  if (/^[a-zA-Z]:/.test(normalized)) {
    return `file:///${normalized}`;
  }
  return `file://${normalized}`;
}

export function uriToFilePath(uri: string): string {
  let filePath = uri.replace('file:///', '').replace('file://', '');
  filePath = decodeURIComponent(filePath);
  if (process.platform === 'win32') {
    filePath = filePath.replace(/\//g, '\\');
  } else if (filePath.length > 0 && !filePath.startsWith('/')) {
    filePath = '/' + filePath;
  }
  return filePath;
}

export function languageIdFromPath(filePath: string): string {
  return LANGUAGE_ID_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? 'plaintext';
}

export function getServerLanguageForFilePath(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  // eslint-disable-next-line security/detect-object-injection -- ext is a sanitized file extension
  return SERVER_LANGUAGE_BY_EXTENSION[ext] ?? null;
}

function completionKindToString(kind?: number): string {
  if (kind === undefined) {
    return 'text';
  }
  return COMPLETION_KIND_MAP.get(kind) ?? 'text';
}

function severityToString(severity?: number): 'error' | 'warning' | 'info' | 'hint' {
  switch (severity) {
    case DiagnosticSeverity.Error:
      return 'error';
    case DiagnosticSeverity.Warning:
      return 'warning';
    case DiagnosticSeverity.Information:
      return 'info';
    case DiagnosticSeverity.Hint:
      return 'hint';
    default:
      return 'info';
  }
}

function extractDocumentation(item: ProtocolCompletionItem): string | undefined {
  if (!item.documentation) {
    return undefined;
  }
  if (typeof item.documentation === 'string') {
    return item.documentation;
  }
  return (item.documentation as MarkupContent).value;
}

export function convertDiagnostics(diagnostics: Diagnostic[]): LspDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    message: diagnostic.message,
    severity: severityToString(diagnostic.severity),
    range: {
      startLine: diagnostic.range.start.line,
      startChar: diagnostic.range.start.character,
      endLine: diagnostic.range.end.line,
      endChar: diagnostic.range.end.character,
    },
  }));
}

export function getServerCommand(language: string): ServerCommand | null {
  const customServers = getConfigValue('lspServers') as Record<string, string> | undefined;
  if (customServers) {
    // eslint-disable-next-line security/detect-object-injection -- language is a validated LSP language identifier
    const custom = customServers[language];
    if (custom) {
      const parts = custom.split(/\s+/);
      return { command: parts[0], args: parts.slice(1) };
    }
  }
  // eslint-disable-next-line security/detect-object-injection -- language is a validated LSP language identifier
  return DEFAULT_SERVER_COMMANDS[language] ?? null;
}

export function normalizeCompletionResult(
  result: ProtocolCompletionItem[] | CompletionList | null,
): CompletionItem[] {
  if (!result) {
    return [];
  }

  const items = Array.isArray(result) ? result : result.items;
  return items.map((item) => ({
    label: item.label,
    kind: completionKindToString(item.kind),
    detail: item.detail,
    insertText: item.insertText ?? item.label,
    documentation: extractDocumentation(item),
  }));
}

export function normalizeHoverContents(
  contents: string | MarkupContent | Array<string | MarkupContent>,
): string {
  if (typeof contents === 'string') {
    return contents;
  }
  if (Array.isArray(contents)) {
    return contents.map((entry) => normalizeHoverContents(entry)).join('\n\n');
  }
  return contents.value;
}

function toLocationLink(result: Location | LocationLink): Location {
  if ('targetUri' in result) {
    return { uri: result.targetUri, range: result.targetRange };
  }
  return result;
}

export function getFirstLocation(
  result: Location | Location[] | LocationLink[] | null,
): Location | undefined {
  if (!result) {
    return undefined;
  }
  if (Array.isArray(result)) {
    return result.length > 0 ? toLocationLink(result[0]) : undefined;
  }
  return result;
}
