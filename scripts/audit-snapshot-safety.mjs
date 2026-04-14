#!/usr/bin/env node
/**
 * audit-snapshot-safety.mjs
 *
 * Static scan of src/main/**\/*.ts for V8-snapshot-hostile patterns:
 *   1. Function calls at module top level (e.g. `startFoo()`)
 *   2. `new Foo()` at module top level that is NOT part of a const/let/var declaration
 *   3. Access to Electron module properties at module top level
 *      (e.g. `app.setName(...)`, `crashReporter.start(...)`)
 *
 * Uses the TypeScript compiler API for a proper AST walk — no regex heuristics
 * on statement bodies.
 *
 * Emits a JSON array to stdout:
 *   [{ file, line, pattern, snippet }]
 *
 * Exit code is always 0 (advisory). A future CI step can fail on new violations.
 *
 * Usage:
 *   node scripts/audit-snapshot-safety.mjs
 *   npm run audit:snapshot
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SCAN_DIR = path.join(ROOT, 'src', 'main');

// ---------------------------------------------------------------------------
// Load TypeScript compiler (already a devDependency)
// ---------------------------------------------------------------------------

const require = createRequire(import.meta.url);
/** @type {import('typescript')} */
const ts = require('typescript');

// ---------------------------------------------------------------------------
// Known Electron module binding names (imported as these identifiers)
// ---------------------------------------------------------------------------

const ELECTRON_NAMESPACES = new Set([
  'app',
  'crashReporter',
  'ipcMain',
  'nativeTheme',
  'powerMonitor',
  'protocol',
  'screen',
  'session',
  'systemPreferences',
  'webContents',
]);

// ---------------------------------------------------------------------------
// File walker (zero extra deps — plain fs recursion)
// ---------------------------------------------------------------------------

/** @param {string} dir @returns {string[]} */
function walkTs(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkTs(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

/**
 * Return the 1-based line for a node.
 * @param {import('typescript').SourceFile} sf
 * @param {import('typescript').Node} node
 */
function lineOf(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/**
 * Return the trimmed source snippet for a node.
 * @param {import('typescript').SourceFile} sf
 * @param {import('typescript').Node} node
 */
function snippetOf(sf, node) {
  const text = node.getText(sf).replace(/\s+/g, ' ').trim();
  return text.length > 120 ? text.slice(0, 117) + '...' : text;
}

/**
 * Resolve the leftmost identifier of a property-access chain.
 * e.g.  app.commandLine.appendSwitch  →  "app"
 * @param {import('typescript').Expression} expr
 * @returns {string | null}
 */
function rootIdentifier(expr) {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return rootIdentifier(expr.expression);
  return null;
}

// ---------------------------------------------------------------------------
// Per-file analysis
// ---------------------------------------------------------------------------

/**
 * @typedef {{ file: string, line: number, pattern: string, snippet: string }} Violation
 */

/**
 * Analyse one TypeScript source file and return violations.
 * @param {string} filePath
 * @returns {Violation[]}
 */
function analyseFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf-8');
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.ESNext, true);

  /** @type {Violation[]} */
  const violations = [];
  const rel = path.relative(ROOT, filePath).replace(/\\/g, '/');

  // Collect Electron-imported names from this file
  /** @type {Set<string>} */
  const electronImports = new Set();
  for (const stmt of sf.statements) {
    if (
      ts.isImportDeclaration(stmt) &&
      ts.isStringLiteral(stmt.moduleSpecifier) &&
      stmt.moduleSpecifier.text === 'electron' &&
      stmt.importClause?.namedBindings &&
      ts.isNamedImports(stmt.importClause.namedBindings)
    ) {
      for (const el of stmt.importClause.namedBindings.elements) {
        electronImports.add(el.name.text);
      }
    }
  }

  for (const stmt of sf.statements) {
    // Skip imports, exports, type/interface declarations, class/function declarations,
    // and variable declarations (const/let/var are safe declarations).
    if (
      ts.isImportDeclaration(stmt) ||
      ts.isExportDeclaration(stmt) ||
      ts.isInterfaceDeclaration(stmt) ||
      ts.isTypeAliasDeclaration(stmt) ||
      ts.isClassDeclaration(stmt) ||
      ts.isFunctionDeclaration(stmt) ||
      ts.isVariableStatement(stmt) ||
      ts.isEnumDeclaration(stmt) ||
      ts.isExportAssignment(stmt) ||
      ts.isModuleDeclaration(stmt)
    ) {
      continue;
    }

    // Everything else at top level is potentially hostile.
    if (!ts.isExpressionStatement(stmt)) continue;

    const expr = stmt.expression;

    // ── Pattern 1: function call at top level ─────────────────────────────
    if (ts.isCallExpression(expr)) {
      const root = rootIdentifier(expr.expression);

      // ── Pattern 3: Electron API property access in a call ─────────────
      if (root && (electronImports.has(root) || ELECTRON_NAMESPACES.has(root))) {
        violations.push({
          file: rel,
          line: lineOf(sf, stmt),
          pattern: 'electron-api-at-module-scope',
          snippet: snippetOf(sf, stmt),
        });
        continue;
      }

      violations.push({
        file: rel,
        line: lineOf(sf, stmt),
        pattern: 'call-at-module-scope',
        snippet: snippetOf(sf, stmt),
      });
      continue;
    }

    // ── Pattern 2: new Foo() at top level (not assigned to a variable) ────
    if (ts.isNewExpression(expr)) {
      violations.push({
        file: rel,
        line: lineOf(sf, stmt),
        pattern: 'new-at-module-scope',
        snippet: snippetOf(sf, stmt),
      });
      continue;
    }

    // ── Pattern 3: property access on an Electron namespace (non-call) ────
    if (ts.isPropertyAccessExpression(expr)) {
      const root = rootIdentifier(expr);
      if (root && (electronImports.has(root) || ELECTRON_NAMESPACES.has(root))) {
        violations.push({
          file: rel,
          line: lineOf(sf, stmt),
          pattern: 'electron-api-at-module-scope',
          snippet: snippetOf(sf, stmt),
        });
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const files = walkTs(SCAN_DIR);
/** @type {Violation[]} */
const allViolations = [];

for (const f of files) {
  try {
    allViolations.push(...analyseFile(f));
  } catch (err) {
    process.stderr.write(`[audit-snapshot] Error parsing ${f}: ${err.message}\n`);
  }
}

// Sort by file then line for deterministic output
allViolations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

process.stdout.write(JSON.stringify(allViolations, null, 2) + '\n');

// Summary to stderr so it doesn't pollute JSON stdout
const fileCount = files.length;
const violationCount = allViolations.length;
process.stderr.write(
  `[audit-snapshot] Scanned ${fileCount} files — ${violationCount} violation(s) found.\n`,
);
