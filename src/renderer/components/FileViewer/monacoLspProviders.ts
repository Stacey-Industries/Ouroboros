/**
 * Global Monaco LSP providers — hover, completions, go-to-definition.
 *
 * Registered once globally (not per editor instance). They read the active
 * file/root from monacoLspContext at invocation time.
 */
import * as monaco from 'monaco-editor';

import { hasLspApi } from './lspShared';
import { getActiveLspContext } from './monacoLspContext';

// ── Completion kind mapping ──────────────────────────────────────────────

const CIK = monaco.languages.CompletionItemKind;
const COMPLETION_KIND_MAP: Record<string, monaco.languages.CompletionItemKind> = {
  text: CIK.Text, method: CIK.Method, function: CIK.Function,
  constructor: CIK.Constructor, field: CIK.Field, variable: CIK.Variable,
  class: CIK.Class, interface: CIK.Interface, module: CIK.Module,
  property: CIK.Property, unit: CIK.Unit, value: CIK.Value,
  enum: CIK.Enum, keyword: CIK.Keyword, snippet: CIK.Snippet,
  color: CIK.Color, file: CIK.File, reference: CIK.Reference,
  folder: CIK.Folder, constant: CIK.Constant, struct: CIK.Struct,
  event: CIK.Event, operator: CIK.Operator, typeparameter: CIK.TypeParameter,
};

function mapCompletionKind(kind: string): monaco.languages.CompletionItemKind {
  return COMPLETION_KIND_MAP[kind.toLowerCase()] ?? CIK.Text;
}

// ── Hover Provider ───────────────────────────────────────────────────────

async function provideHover(
  _model: monaco.editor.ITextModel,
  position: monaco.Position,
): Promise<monaco.languages.Hover | null> {
  if (!hasLspApi()) return null;
  const ctx = getActiveLspContext();
  if (!ctx) return null;
  try {
    const r = await window.electronAPI.lsp.hover(
      ctx.root, ctx.filePath,
      position.lineNumber - 1, position.column - 1,
    );
    if (!r.success || typeof r.contents !== 'string' || !r.contents) return null;
    return { contents: [{ value: r.contents }] };
  } catch { return null; }
}

let hoverReg: monaco.IDisposable | null = null;

export function registerLspHoverProvider(): monaco.IDisposable {
  if (hoverReg) return hoverReg;
  hoverReg = monaco.languages.registerHoverProvider(
    { pattern: '**' }, { provideHover },
  );
  const orig = hoverReg.dispose.bind(hoverReg);
  hoverReg.dispose = () => { orig(); hoverReg = null; };
  return hoverReg;
}

// ── Completion Provider (non-TS/JS) ──────────────────────────────────────

const SKIP_LANGS = new Set(['typescript', 'javascript']);

async function provideCompletionItems(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): Promise<monaco.languages.CompletionList | null> {
  if (!hasLspApi()) return null;
  const ctx = getActiveLspContext();
  if (!ctx || SKIP_LANGS.has(model.getLanguageId())) return null;
  try {
    const r = await window.electronAPI.lsp.completion(
      ctx.root, ctx.filePath,
      position.lineNumber - 1, position.column - 1,
    );
    if (!r.success || !r.items?.length) return null;
    const word = model.getWordUntilPosition(position);
    const range = new monaco.Range(
      position.lineNumber, word.startColumn,
      position.lineNumber, position.column,
    );
    return {
      suggestions: r.items.map((item) => ({
        label: item.label,
        kind: mapCompletionKind(item.kind),
        insertText: item.insertText ?? item.label,
        detail: item.detail,
        documentation: item.documentation ? { value: item.documentation } : undefined,
        range,
      })),
    };
  } catch { return null; }
}

let completionReg: monaco.IDisposable | null = null;

export function registerLspCompletionProvider(): monaco.IDisposable {
  if (completionReg) return completionReg;
  completionReg = monaco.languages.registerCompletionItemProvider(
    ['python', 'rust', 'go', 'css', 'html', 'json'],
    {
      triggerCharacters: ['.', ':', '<', '"', "'", '/', '@'],
      provideCompletionItems,
    },
  );
  const orig = completionReg.dispose.bind(completionReg);
  completionReg.dispose = () => { orig(); completionReg = null; };
  return completionReg;
}

// ── Definition Provider ──────────────────────────────────────────────────

function openFileInEditor(fp: string, line: number, col: number): void {
  window.dispatchEvent(
    new CustomEvent('agent-ide:open-file', { detail: { filePath: fp, line, col } }),
  );
}

async function provideDefinition(
  _model: monaco.editor.ITextModel,
  position: monaco.Position,
): Promise<monaco.languages.Definition | null> {
  if (!hasLspApi()) return null;
  const ctx = getActiveLspContext();
  if (!ctx) return null;
  try {
    const r = await window.electronAPI.lsp.definition(
      ctx.root, ctx.filePath,
      position.lineNumber - 1, position.column - 1,
    );
    if (!r.success || !r.location) return null;
    const loc = r.location;
    if (loc.filePath !== ctx.filePath) {
      openFileInEditor(loc.filePath, loc.line + 1, loc.character + 1);
    }
    return {
      uri: monaco.Uri.file(loc.filePath),
      range: new monaco.Range(
        loc.line + 1, loc.character + 1,
        loc.line + 1, loc.character + 1,
      ),
    };
  } catch { return null; }
}

let defReg: monaco.IDisposable | null = null;

export function registerLspDefinitionProvider(): monaco.IDisposable {
  if (defReg) return defReg;
  defReg = monaco.languages.registerDefinitionProvider(
    { pattern: '**' }, { provideDefinition },
  );
  const orig = defReg.dispose.bind(defReg);
  defReg.dispose = () => { orig(); defReg = null; };
  return defReg;
}

// ── Bulk registration ────────────────────────────────────────────────────

export function registerAllLspProviders(): void {
  registerLspHoverProvider();
  registerLspCompletionProvider();
  registerLspDefinitionProvider();
}
