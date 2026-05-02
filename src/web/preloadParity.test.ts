/**
 * preloadParity.test.ts — guards web/Electron preload surface drift.
 *
 * The web preload (src/web/webPreload*.ts) must mirror the Electron preload
 * (src/preload/preload*.ts) per the CLAUDE.md contract. When they drift, web
 * clients get "X is not a function" at runtime.
 *
 * Approach: extract method names per namespace from the Electron preload
 * literal `const xAPI: ElectronAPI['x'] = { ... }`, then assert each method
 * name appears at least once in the web preload source set. Missing methods
 * are real drift; the web side might shadow them with desktopOnlyStub or
 * implement them under a builder helper, but the literal name must appear.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '../..');

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
}

const ELECTRON_SOURCES = [
  'src/preload/preload.ts',
  'src/preload/preloadSupplementalApis.ts',
  'src/preload/preloadSupplementalRulesSkills.ts',
  'src/preload/preloadSupplementalMemoryApis.ts',
].map(readSrc).join('\n');

const WEB_SOURCE_FILES = [
  'src/web/webPreload.ts',
  'src/web/webPreloadApis.ts',
  'src/web/webPreloadApisAuth.ts',
  'src/web/webPreloadApisClaudeMd.ts',
  'src/web/webPreloadApisExtended.ts',
  'src/web/webPreloadApisRulesSkills.ts',
  'src/web/webPreloadApisSessionCrud.ts',
  'src/web/webPreloadApisSupplemental.ts',
];
const WEB_SOURCES = WEB_SOURCE_FILES
  .map((p) => {
    try {
      return readSrc(p);
    } catch {
      return '';
    }
  })
  .join('\n');

function sliceBalanced(source: string, start: number): string | null {
  let depth = 1;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i);
    }
  }
  return null;
}

/**
 * Pulls method names from a `const xAPI: ElectronAPI['x'] = { ... }` literal.
 * Matches identifier keys followed by `:` or `(` at lexical positions where a
 * key would appear (start of line, after `,`, after `{`).
 */
function findElectronMethods(namespace: string): Set<string> {
  const patterns = [
    new RegExp(`const\\s+${namespace}API\\s*(?::[^=]+)?=\\s*\\{`),
    new RegExp(`const\\s+${namespace}Api\\s*(?::[^=]+)?=\\s*\\{`),
    // Inline namespace assignment in a parent object: `approval: {`
    new RegExp(`(?:^|[\\s,{])${namespace}\\s*:\\s*\\{`, 'm'),
  ];
  let body: string | null = null;
  for (const re of patterns) {
    const m = re.exec(ELECTRON_SOURCES);
    if (!m) continue;
    body = sliceBalanced(ELECTRON_SOURCES, m.index + m[0].length);
    if (body) break;
  }
  if (!body) return new Set();

  const names = new Set<string>();
  // Match keys that begin lines (or follow comma) at the current nesting level.
  // We split by top-level commas using a depth-aware scan, then take the first
  // identifier on each top-level segment.
  const segments = splitTopLevel(body);
  const keyRe = /^\s*([a-zA-Z_$][\w$]*)\s*[:(]/;
  for (const seg of segments) {
    const km = keyRe.exec(seg);
    if (km) names.add(km[1]);
  }
  return names;
}

interface SplitState {
  depth: number;
  buf: string;
  inStr: string | null;
}

function isOpener(c: string): boolean {
  return c === '{' || c === '(' || c === '[';
}

function isCloser(c: string): boolean {
  return c === '}' || c === ')' || c === ']';
}

function stepInString(state: SplitState, c: string, prev: string): boolean {
  if (!state.inStr) return false;
  state.buf += c;
  if (c === state.inStr && prev !== '\\') state.inStr = null;
  return true;
}

function stepStringStart(state: SplitState, c: string): boolean {
  if (c !== '"' && c !== "'" && c !== '`') return false;
  state.inStr = c;
  state.buf += c;
  return true;
}

function stepSplit(state: SplitState, c: string, prev: string, out: string[]): void {
  if (stepInString(state, c, prev)) return;
  if (stepStringStart(state, c)) return;
  if (isOpener(c)) state.depth += 1;
  else if (isCloser(c)) state.depth -= 1;
  if (c === ',' && state.depth === 0) {
    out.push(state.buf);
    state.buf = '';
    return;
  }
  state.buf += c;
}

function splitTopLevel(body: string): string[] {
  const out: string[] = [];
  const state: SplitState = { depth: 0, buf: '', inStr: null };
  for (let i = 0; i < body.length; i += 1) {
    stepSplit(state, body[i], body[i - 1] ?? '', out);
  }
  if (state.buf.trim()) out.push(state.buf);
  return out;
}

const NAMESPACES = [
  'pty', 'config', 'files', 'hooks', 'app', 'shell', 'theme', 'git',
  'auth', 'providers', 'codex', 'window', 'extensions',
  'approval', 'sessions', 'cost', 'usage',
  'mcp', 'mcpStore', 'extensionStore', 'context', 'ideTools',
  'codemode', 'orchestration', 'contextLayer',
  'claudeMd', 'mobileAccess', 'compareProviders',
] as const;

describe('preload parity (web ⇄ electron)', () => {
  for (const ns of NAMESPACES) {
    it(`every method on electron preload "${ns}" appears in web sources`, () => {
      const electronMethods = findElectronMethods(ns);
      expect(
        electronMethods.size,
        `Electron preload literal not found for namespace "${ns}" — extraction may need updating`,
      ).toBeGreaterThan(0);

      const missing = [...electronMethods]
        .filter((name) => {
          // Look for the method name as a key in the web sources (followed by `:` or `(`).
          const re = new RegExp(`\\b${name}\\s*[:(]`);
          return !re.test(WEB_SOURCES);
        })
        .sort();

      expect(missing, `methods missing in web preload for "${ns}"`).toEqual([]);
    });
  }
});
