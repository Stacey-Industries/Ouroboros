// pre_commit_lint.mjs
// PreToolUse(Bash) hook — when the agent runs `git commit`, audits staged
// .ts/.tsx files for prettier/eslint violations and runs tsc on both projects.
// Exits 2 (BLOCK) if violations are found, 0 otherwise. Also blocks on
// pre-existing src/ lint errors and new hardcoded colors in renderer files.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

async function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) { resolve(''); return; }
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolve(''));
  });
}

function quoteIfNeeded(arg) {
  return /[\s"]/.test(arg) ? `"${String(arg).replace(/"/g, '\\"')}"` : arg;
}

function run(cmd, args, cwd) {
  // Single-string command form: avoids Windows .cmd shim issues with
  // shell:false (EINVAL) and the DEP0190 array-arg concatenation warning.
  // We explicitly quote args containing whitespace or quotes.
  const cmdString = [cmd, ...args.map(quoteIfNeeded)].join(' ');
  const res = spawnSync(cmdString, { cwd, encoding: 'utf8', shell: true });
  return { code: res.status ?? 0, out: (res.stdout || '') + (res.stderr || '') };
}

const stdin = await readStdin();
if (!stdin.trim()) process.exit(0);

let data;
try { data = JSON.parse(stdin); } catch {
  process.stderr.write('pre_commit_lint: invalid JSON on stdin\n');
  process.exit(0);
}

const command = data?.tool_input?.command;
if (!command || !/\bgit\s+commit\b/.test(command)) process.exit(0);

const gitTop = run('git', ['rev-parse', '--show-toplevel']);
const projectRoot = gitTop.code === 0 ? gitTop.out.trim() : null;
if (!projectRoot || !existsSync(join(projectRoot, 'package.json'))) {
  process.stderr.write('pre_commit_lint: could not resolve project root with package.json\n');
  process.exit(0);
}

// CLAUDE.md size cap: only block when a violating CLAUDE.md is itself staged.
// Pre-existing over-cap files do not block unrelated commits (Phase D trims them).
const stagedMd = run('git', ['diff', '--cached', '--name-only', '--diff-filter=d', '--', '**/CLAUDE.md'], projectRoot);
const stagedMdFiles = stagedMd.out.split('\n').map((f) => f.trim()).filter(Boolean);
if (stagedMdFiles.length > 0) {
  const claudeMdCheck = run('npm', ['run', 'lint:claude-md', '--silent'], projectRoot);
  if (claudeMdCheck.code !== 0 && claudeMdCheck.out.trim()) {
    const claudeMdViolations = claudeMdCheck.out.split('\n')
      .filter((l) => l.trim())
      .filter((l) => stagedMdFiles.some((f) => l.includes(f)));
    if (claudeMdViolations.length > 0) {
      const msg = `Commit blocked - staged CLAUDE.md size cap violations:\n\n${claudeMdViolations.map((l) => `  [lint:claude-md] ${l}`).join('\n')}`;
      process.stderr.write(msg + '\n');
      process.stdout.write(msg);
      process.exit(2);
    }
  }
}

const staged = run('git', ['diff', '--cached', '--name-only', '--diff-filter=d', '--', '*.ts', '*.tsx'], projectRoot);
const fileList = staged.out.split('\n').map((f) => f.trim()).filter(Boolean);
if (fileList.length === 0) process.exit(0);

const violations = [];

const prettier = run('npx', ['prettier', '--check', ...fileList], projectRoot);
if (prettier.code !== 0 && prettier.out.trim()) {
  for (const line of prettier.out.split('\n')) {
    const trimmed = line.trim();
    if (/\.(tsx?)$/.test(trimmed) && !/Checking/.test(trimmed)) {
      violations.push(`  [prettier] ${trimmed} -- needs formatting (run: npx prettier --write)`);
    }
  }
}

const eslint = run('npx', ['eslint', '--no-warn-ignored', ...fileList], projectRoot);
if (eslint.code !== 0 && eslint.out.trim()) {
  for (const line of eslint.out.split('\n')) {
    if (line.trim()) violations.push(`  ${line}`);
  }
}

const eslintFull = run('npx', ['eslint', 'src/', '--no-warn-ignored', '--quiet'], projectRoot);
if (eslintFull.code !== 0 && eslintFull.out.trim()) {
  violations.push('');
  violations.push('  [full-project lint] errors outside staged files also block commit:');
  for (const line of eslintFull.out.split('\n')) {
    if (line.trim()) violations.push(`  ${line}`);
  }
}

for (const proj of ['tsconfig.web.json', 'tsconfig.node.json']) {
  if (!existsSync(join(projectRoot, proj))) continue;
  const tsc = run('npx', ['tsc', '--noEmit', '-p', proj], projectRoot);
  if (tsc.code !== 0 && tsc.out.trim()) {
    for (const line of tsc.out.split('\n')) {
      if (line.trim()) violations.push(`  [tsc:${proj}] ${line}`);
    }
  }
}

const rendererFiles = fileList.filter(
  (f) => /^src[\\/]renderer[\\/]/.test(f.replaceAll('/', sep)) && /\.(tsx?)$/.test(f) && !/^src[\\/]renderer[\\/]themes[\\/]/.test(f.replaceAll('/', sep)),
);
if (rendererFiles.length > 0) {
  const colorHits = [];
  for (const rf of rendererFiles) {
    const diff = run('git', ['diff', '--cached', '-U0', '--', rf], projectRoot);
    const added = diff.out.split('\n').filter((l) => /^\+[^+]/.test(l));
    for (const line of added) {
      if (/var\(--/.test(line) || /^\+\s*\/\//.test(line) || /^\+\s*\*/.test(line) || /tokens\.css/.test(line) || /@theme/.test(line)) continue;
      if (/#[0-9a-fA-F]{3,8}\b/.test(line) && !/eslint-disable/.test(line) && !/\/\/ hardcoded:/.test(line)) {
        colorHits.push(`  [color] ${rf} -- hardcoded hex: ${line.trim().slice(1)}`);
      }
      if (/rgba?\(/.test(line) && !/var\(/.test(line) && !/eslint-disable/.test(line) && !/\/\/ hardcoded:/.test(line)) {
        colorHits.push(`  [color] ${rf} -- hardcoded rgba: ${line.trim().slice(1)}`);
      }
    }
  }
  if (colorHits.length > 0) {
    violations.push('');
    violations.push('  [color] New hardcoded colors in renderer files. Use design tokens instead.');
    violations.push('  [color] See: src/renderer/styles/tokens.css and .claude/rules/renderer.md');
    violations.push("  [color] Add '// hardcoded: <reason>' comment to suppress for intentional exceptions.");
    violations.push('');
    violations.push(...colorHits);
  }
}

if (violations.length === 0) process.exit(0);

const summary = `Commit blocked - staged file violations (${fileList.length} files checked):\n\n${violations.join('\n')}`;
process.stderr.write(summary + '\n');
process.stdout.write(summary);
process.exit(2);
