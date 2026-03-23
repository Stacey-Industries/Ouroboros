/**
 * fileNestingRules — VS Code-style file nesting for the file tree.
 *
 * Groups related files (test files, type declarations, CSS modules, etc.)
 * under their "parent" file. Disabled by default; toggled via the store.
 */

import type { TreeNode } from './FileTreeItem';

// ─── Default Nesting Rules ───────────────────────────────────────────────────

/**
 * Each key is a file pattern (exact name or `*.ext`).
 * Values are patterns for files that should nest under the parent.
 * `${basename}` is replaced with the parent filename sans extension.
 * `*` in patterns acts as a simple glob.
 */
export const DEFAULT_NESTING_RULES: Record<string, string[]> = {
  '*.ts': [
    '${basename}.test.ts',
    '${basename}.spec.ts',
    '${basename}.d.ts',
    '${basename}.js',
    '${basename}.js.map',
  ],
  '*.tsx': [
    '${basename}.test.tsx',
    '${basename}.spec.tsx',
    '${basename}.module.css',
    '${basename}.module.scss',
    '${basename}.stories.tsx',
    '${basename}.stories.ts',
  ],
  '*.js': [
    '${basename}.test.js',
    '${basename}.spec.js',
    '${basename}.d.ts',
    '${basename}.js.map',
    '${basename}.min.js',
  ],
  'package.json': [
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    '.npmrc',
    '.yarnrc',
    '.yarnrc.yml',
    'bun.lockb',
  ],
  'tsconfig.json': ['tsconfig.*.json'],
  '.env': ['.env.*', '.env.local', '.env.development', '.env.production'],
  'README.md': [
    'CHANGELOG.md',
    'LICENSE',
    'LICENSE.md',
    'CONTRIBUTING.md',
  ],
  '.gitignore': ['.gitattributes', '.gitmodules', '.mailmap'],
  'Cargo.toml': ['Cargo.lock'],
  'pyproject.toml': ['poetry.lock', 'setup.py', 'setup.cfg'],
};

// ─── Pattern Helpers ─────────────────────────────────────────────────────────

/**
 * Given a filename, return the basename without extension.
 * e.g. "App.tsx" -> "App", "foo.test.ts" -> "foo.test"
 */
function stripExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
}

/**
 * Expand a nesting pattern by replacing `${basename}` with the actual basename
 * (without extension) of the parent file.
 */
export function expandNestingPattern(
  pattern: string,
  parentBasename: string,
): string {
  return pattern.replace(/\$\{basename\}/g, parentBasename);
}

/**
 * Test whether a filename matches a simple glob pattern.
 * Supports:
 *   - Exact match: "package-lock.json"
 *   - Leading wildcard: "*.ts"
 *   - Embedded wildcard: "tsconfig.*.json"
 *   - .env.* style
 */
function matchesGlob(filename: string, pattern: string): boolean {
  if (!pattern.includes('*')) {
    return filename === pattern;
  }

  // Convert glob to regex: escape dots, replace * with .*
  const regexStr =
    '^' +
    pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*') +
    '$';
  return new RegExp(regexStr).test(filename);
}

/**
 * Check whether a parent file pattern matches a given filename.
 * Patterns can be exact ("package.json") or extension-based ("*.ts").
 */
function parentPatternMatches(filename: string, pattern: string): boolean {
  return matchesGlob(filename, pattern);
}

// ─── Core Nesting Logic ──────────────────────────────────────────────────────

/**
 * For a given parent filename and a set of nesting rules, return the set of
 * child filename patterns that should nest under it (expanded with the parent's
 * basename).
 */
function getChildPatternsForParent(
  parentName: string,
  rules: Record<string, string[]>,
): string[] {
  const result: string[] = [];
  const parentBase = stripExtension(parentName);

  for (const [parentPattern, childPatterns] of Object.entries(rules)) {
    if (parentPatternMatches(parentName, parentPattern)) {
      for (const cp of childPatterns) {
        result.push(expandNestingPattern(cp, parentBase));
      }
    }
  }

  return result;
}

/**
 * Apply nesting rules to a flat list of sibling nodes (children of the same directory).
 * Returns a new array where nested children are removed from the top level and attached
 * to their parent node's `nestedChildren` array.
 *
 * This only operates on one directory level at a time — call recursively for the
 * whole tree.
 */
interface FileMatchContext {
  filesByName: Map<string, TreeNode>;
  nestedChildNames: Set<string>;
  children: TreeNode[];
}

/** Find matching files for a single pattern from the file map */
function collectMatchingFiles(
  pattern: string,
  parentName: string,
  ctx: FileMatchContext,
): void {
  for (const [name, node] of ctx.filesByName) {
    if (name === parentName) continue;
    if (ctx.nestedChildNames.has(name)) continue;
    if (matchesGlob(name, pattern)) {
      ctx.children.push(node);
      ctx.nestedChildNames.add(name);
    }
  }
}

/** Build the parent -> children nesting map */
function buildNestingMap(
  files: TreeNode[],
  filesByName: Map<string, TreeNode>,
  rules: Record<string, string[]>,
): { nestedChildNames: Set<string>; parentToChildren: Map<string, TreeNode[]> } {
  const nestedChildNames = new Set<string>();
  const parentToChildren = new Map<string, TreeNode[]>();

  for (const parentFile of files) {
    const childPatterns = getChildPatternsForParent(parentFile.name, rules);
    if (childPatterns.length === 0) continue;

    const children: TreeNode[] = [];
    const ctx: FileMatchContext = { filesByName, nestedChildNames, children };
    for (const pattern of childPatterns) {
      collectMatchingFiles(pattern, parentFile.name, ctx);
    }
    if (children.length > 0) {
      parentToChildren.set(parentFile.name, children);
    }
  }

  return { nestedChildNames, parentToChildren };
}

function nestSiblings(
  nodes: TreeNode[],
  rules: Record<string, string[]>,
): TreeNode[] {
  const files = nodes.filter((n) => !n.isDirectory);
  const dirs = nodes.filter((n) => n.isDirectory);

  const filesByName = new Map<string, TreeNode>();
  for (const f of files) {
    filesByName.set(f.name, f);
  }

  const { nestedChildNames, parentToChildren } = buildNestingMap(files, filesByName, rules);

  const result: TreeNode[] = [...dirs];
  for (const file of files) {
    if (nestedChildNames.has(file.name)) continue;
    const nested = parentToChildren.get(file.name);
    if (nested && nested.length > 0) {
      result.push({
        ...file,
        hasNestedChildren: true,
        nestedChildren: nested,
      } as TreeNode & { hasNestedChildren: boolean; nestedChildren: TreeNode[] });
    } else {
      result.push(file);
    }
  }

  return result;
}

/**
 * Apply nesting rules recursively to the entire tree.
 * For each directory's children, applies nesting and recurses into subdirectories.
 */
export function applyNesting(
  nodes: TreeNode[],
  rules: Record<string, string[]> = DEFAULT_NESTING_RULES,
): TreeNode[] {
  return nestSiblings(nodes, rules).map((node) => {
    if (node.isDirectory && node.children) {
      return { ...node, children: applyNesting(node.children, rules) };
    }
    return node;
  });
}
