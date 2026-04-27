/**
 * claude-md-size-check.ts — Wave 49 Phase C
 *
 * Walks the repo from cwd and flags any CLAUDE.md over the line cap that
 * lacks the grandfather marker. Reads the cap from claudeMdSettings.maxLines
 * in configSchemaTail.ts defaults; falls back to 200 if unavailable.
 *
 * Grandfather marker: <!-- claude-md-grandfathered -->
 * Excludes: node_modules, .git, dist, build, .claude/worktrees
 *
 * Run: npx tsx scripts/claude-md-size-check.ts
 * Exit 0 — no violations. Exit 1 — one or more violations.
 */

import fs from 'fs';
import path from 'path';

const GRANDFATHER_MARKER = '<!-- claude-md-grandfathered -->';
const DEFAULT_CAP = 200;
const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);
const EXCLUDE_PATH_SEGMENTS = [path.join('.claude', 'worktrees')];

function getLineCap(): number {
  try {
    const schemaPath = path.join(process.cwd(), 'src', 'main', 'configSchemaTail.ts');
    const src = fs.readFileSync(schemaPath, 'utf8');
    const match = /maxLines:\s*\{\s*type:\s*'number',\s*default:\s*(\d+)/.exec(src);
    if (match?.[1]) return parseInt(match[1], 10);
  } catch {
    // Unavailable — use default
  }
  return DEFAULT_CAP;
}

function isExcluded(filePath: string, root: string): boolean {
  const rel = path.relative(root, filePath);
  const parts = rel.split(path.sep);
  if (parts.some((p) => EXCLUDE_DIRS.has(p))) return true;
  return EXCLUDE_PATH_SEGMENTS.some((seg) => rel.includes(seg));
}

function countLines(content: string): number {
  // Count total lines matching `wc -l` semantics (number of newlines).
  // Anthropic's 200-line guideline refers to total file length, not filtered lines.
  // The plan's exemplar counts (209/209/205/202) match raw total line counts.
  const lines = content.split('\n');
  // Trim the trailing empty element produced by a final newline.
  if (lines.length > 0 && lines[lines.length - 1] === '') return lines.length - 1;
  return lines.length;
}

function walkDir(dir: string, root: string, results: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (isExcluded(fullPath, root)) continue;
    if (entry.isDirectory()) {
      walkDir(fullPath, root, results);
    } else if (entry.isFile() && entry.name === 'CLAUDE.md') {
      results.push(fullPath);
    }
  }
}

function checkFile(filePath: string, cap: number): string | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  if (content.includes(GRANDFATHER_MARKER)) return null;
  const lineCount = countLines(content);
  if (lineCount <= cap) return null;
  return `${filePath}: ${lineCount} lines (cap: ${cap})`;
}

function main(): void {
  const root = process.cwd();
  const cap = getLineCap();
  const files: string[] = [];
  walkDir(root, root, files);

  const violations: string[] = [];
  for (const f of files) {
    const v = checkFile(f, cap);
    if (v) violations.push(v);
  }

  if (violations.length === 0) {
    process.stdout.write(`[lint:claude-md] All CLAUDE.md files within ${cap}-line cap.\n`);
    process.exit(0);
  }

  process.stderr.write(`[lint:claude-md] CLAUDE.md size violations (cap: ${cap} lines):\n`);
  for (const v of violations) {
    process.stderr.write(`  ${v}\n`);
  }
  process.stderr.write(
    `\n${violations.length} violation(s). Trim the file(s) or add '${GRANDFATHER_MARKER}' to grandfather.\n`,
  );
  process.exit(1);
}

main();
