/**
 * boundaryRegistry.ts — Wave 85 Phase 2.
 *
 * Scans src/main/**‌/*.ts for ipcMain.handle() registrations and
 * src/preload/**‌/*.ts for ipcRenderer.invoke() bridge calls.
 * Builds an in-memory registry the trace engine uses to resolve IPC
 * boundaries: bridge call → channel → main handler symbol.
 *
 * Decision 3 (wave-85-decisions.md): Tree-sitter substrate is in package.json
 * via the graph indexer. For the constrained ipcMain.handle pattern, a
 * targeted regex scan is faster than a full AST walk and produces equivalent
 * accuracy for the literal-string argument case.
 */

import fs from 'fs';
import path from 'path';

import log from '../logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MainHandlerEntry {
  handlerSymbol: string;
  handlerFile: string;
  handlerLine: number;
}

export interface BridgeEntry {
  channel: string;
  namespace: string;
  method: string;
}

export interface BoundaryRegistry {
  ipcMainHandlers: Map<string, MainHandlerEntry>;
  preloadBridge: Map<string, BridgeEntry>;
  builtAt: number;
}

// ─── Module state ─────────────────────────────────────────────────────────────

let _registry: BoundaryRegistry | null = null;
let _buildPromise: Promise<BoundaryRegistry> | null = null;
let _projectRoot: string = process.cwd();

export function setProjectRoot(root: string): void {
  _projectRoot = root;
}

// ─── Regex patterns ───────────────────────────────────────────────────────────

const IPCMAIN_HANDLE_RE =
  /ipcMain\.handle\(\s*(['"`])([^'"`]+)\1\s*,\s*(async\s|[a-zA-Z_$][\w$]*|[^,)])/g;

const IPCRENDERER_INVOKE_RE = /ipcRenderer\.invoke\(\s*(['"`])([^'"`]+)\1/g;

const NS_FROM_FILE_RE = /preloadSupplemental(\w+?)(?:Apis)?\.ts$/i;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveNsFromChannel(channel: string): string {
  const colon = channel.indexOf(':');
  return colon > 0 ? channel.slice(0, colon) : channel;
}

function deriveMethodFromChannel(channel: string): string {
  const colon = channel.indexOf(':');
  if (colon < 0) return channel;
  return channel.slice(colon + 1).replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase());
}

function nsFromFilePath(relPath: string): string {
  const m = relPath.match(NS_FROM_FILE_RE);
  if (!m) return '';
  return m[1].charAt(0).toLowerCase() + m[1].slice(1);
}

const RESERVED_HANDLER_TOKENS = new Set(['async', 'function', 'await', 'return']);

function handlerSymbolFromToken(token: string, channel: string): string {
  const trimmed = token.trim();
  if (/^[a-zA-Z_$][\w$]*$/.test(trimmed) && !RESERVED_HANDLER_TOKENS.has(trimmed)) {
    return trimmed;
  }
  return `<handler:${channel}>`;
}

function lineNumberAtIndex(src: string, idx: number): number {
  let line = 1;
  const end = Math.min(idx, src.length);
  for (let i = 0; i < end; i++) {
    if (src.charCodeAt(i) === 10) line++; // 10 === '\n'
  }
  return line;
}

// ─── Per-file scanners ────────────────────────────────────────────────────────

function scanMainFile(
  src: string,
  relPath: string,
): Array<{ channel: string; entry: MainHandlerEntry }> {
  const results: Array<{ channel: string; entry: MainHandlerEntry }> = [];
  IPCMAIN_HANDLE_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = IPCMAIN_HANDLE_RE.exec(src)) !== null) {
    const channel = match[2];
    const handlerToken = match[3] ?? '';
    results.push({
      channel,
      entry: {
        handlerSymbol: handlerSymbolFromToken(handlerToken, channel),
        handlerFile: relPath,
        handlerLine: lineNumberAtIndex(src, match.index),
      },
    });
  }

  return results;
}

function scanPreloadFile(src: string, relPath: string): BridgeEntry[] {
  const results: BridgeEntry[] = [];
  const inferredNs = nsFromFilePath(relPath);
  const seen = new Set<string>();

  IPCRENDERER_INVOKE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = IPCRENDERER_INVOKE_RE.exec(src)) !== null) {
    const channel = match[2];
    const namespace = inferredNs || deriveNsFromChannel(channel);

    // Look backward in the source for the property key: scan for `identifier :`
    // in the 200-character window before the match to avoid long backtracking.
    const windowStart = Math.max(0, match.index - 200);
    const before = src.slice(windowStart, match.index);
    // Simple pattern: last `word :` before the invoke call (no nested quantifiers).
    const methodMatch = before.match(/(\w+)\s*:\s*\w*\s*$/);
    const method = methodMatch ? methodMatch[1] : deriveMethodFromChannel(channel);

    const key = `${namespace}.${method}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ channel, namespace, method });
    }
  }

  return results;
}

// ─── File discovery ───────────────────────────────────────────────────────────

function safeReadDir(dir: string): fs.Dirent[] {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is derived from trusted project root
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

const SKIP_DIRS = new Set(['node_modules', 'out', 'dist', 'build', 'coverage', '.git']);

function listTsFilesInner(dir: string, acc: string[]): void {
  for (const entry of safeReadDir(dir)) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listTsFilesInner(full, acc);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      acc.push(full);
    }
  }
}

function listTsFiles(dir: string): string[] {
  const acc: string[] = [];
  listTsFilesInner(dir, acc);
  return acc;
}

function readFileSafe(absPath: string): string | null {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- absPath is from trusted fs scan
    return fs.readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
}

// ─── Scan orchestrator ────────────────────────────────────────────────────────

function scanMainDir(
  mainDir: string,
  projectRoot: string,
  handlers: Map<string, MainHandlerEntry>,
): void {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- mainDir is from trusted project root
  if (!fs.existsSync(mainDir)) return;
  for (const absPath of listTsFiles(mainDir)) {
    const src = readFileSafe(absPath);
    if (src === null) continue;
    const relPath = path.relative(projectRoot, absPath).replace(/\\/g, '/');
    for (const { channel, entry } of scanMainFile(src, relPath)) {
      if (!handlers.has(channel)) handlers.set(channel, entry);
    }
  }
}

function scanPreloadDir(
  preloadDir: string,
  projectRoot: string,
  bridge: Map<string, BridgeEntry>,
): void {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- preloadDir is from trusted project root
  if (!fs.existsSync(preloadDir)) return;
  for (const absPath of listTsFiles(preloadDir)) {
    const src = readFileSafe(absPath);
    if (src === null) continue;
    const relPath = path.relative(projectRoot, absPath).replace(/\\/g, '/');
    for (const br of scanPreloadFile(src, relPath)) {
      const key = `${br.namespace}.${br.method}`;
      if (!bridge.has(key)) bridge.set(key, br);
    }
  }
}

async function buildRegistry(): Promise<BoundaryRegistry> {
  const handlers = new Map<string, MainHandlerEntry>();
  const bridge = new Map<string, BridgeEntry>();
  const root = _projectRoot;

  scanMainDir(path.join(root, 'src', 'main'), root, handlers);
  scanPreloadDir(path.join(root, 'src', 'preload'), root, bridge);

  log.info(
    `[boundaryRegistry] built: ${handlers.size} main handlers, ${bridge.size} bridge entries`,
  );

  return { ipcMainHandlers: handlers, preloadBridge: bridge, builtAt: Date.now() };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getBoundaryRegistry(): Promise<BoundaryRegistry> {
  if (_registry) return _registry;
  if (!_buildPromise) {
    _buildPromise = buildRegistry()
      .then((r) => {
        _registry = r;
        _buildPromise = null;
        return r;
      })
      .catch((err) => {
        _buildPromise = null;
        log.warn('[boundaryRegistry] build failed:', err);
        const empty: BoundaryRegistry = {
          ipcMainHandlers: new Map(),
          preloadBridge: new Map(),
          builtAt: Date.now(),
        };
        _registry = empty;
        return empty;
      });
  }
  return _buildPromise;
}

export async function rebuildBoundaryRegistry(): Promise<void> {
  _registry = null;
  _buildPromise = null;
  await getBoundaryRegistry();
}

export function lookupMainHandler(
  registry: BoundaryRegistry,
  channel: string,
): MainHandlerEntry | null {
  return registry.ipcMainHandlers.get(channel) ?? null;
}

export function lookupBridge(
  registry: BoundaryRegistry,
  namespaceMethod: string,
): BridgeEntry | null {
  return registry.preloadBridge.get(namespaceMethod) ?? null;
}
