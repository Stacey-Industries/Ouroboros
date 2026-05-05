// pre_push_full_check.mjs
// PreToolUse(Bash) hook — when the agent runs `git push`, runs full-project
// tsc (tsconfig.web.json + tsconfig.node.json) and eslint on src/.
// Exits 2 (BLOCK) if violations are found, 0 otherwise.
//
// Full-project checks belong at push time, not commit time. This keeps commits
// fast and avoids blocking on unrelated in-flight work elsewhere in the tree.
// Industry-standard 2026 pattern: lint-staged for pre-commit, full checks at
// pre-push or CI.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

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
  process.stderr.write('pre_push_full_check: invalid JSON on stdin\n');
  process.exit(0);
}

if (process.env.OUROBOROS_SKIP_QUALITY_HOOKS === '1') process.exit(0);

const command = data?.tool_input?.command;
if (!command || !/\bgit\s+push\b/.test(command)) process.exit(0);

const gitTop = run('git', ['rev-parse', '--show-toplevel']);
const projectRoot = gitTop.code === 0 ? gitTop.out.trim() : null;
if (!projectRoot || !existsSync(join(projectRoot, 'package.json'))) {
  process.stderr.write('pre_push_full_check: could not resolve project root with package.json\n');
  process.exit(0);
}

const violations = [];

for (const proj of ['tsconfig.web.json', 'tsconfig.node.json']) {
  if (!existsSync(join(projectRoot, proj))) continue;
  const tsc = run('npx', ['tsc', '--noEmit', '-p', proj], projectRoot);
  if (tsc.code !== 0 && tsc.out.trim()) {
    violations.push(`[tsc:${proj}] type errors found. Reproduce with: npx tsc --noEmit -p ${proj}`);
    violations.push('');
    for (const line of tsc.out.split('\n')) {
      if (line.trim()) violations.push(`  ${line}`);
    }
    violations.push('');
  }
}

const eslintFull = run('npx', ['eslint', 'src/', '--no-warn-ignored', '--quiet'], projectRoot);
if (eslintFull.code !== 0 && eslintFull.out.trim()) {
  violations.push('[eslint] project-wide lint errors found. Reproduce with: npx eslint src/ --no-warn-ignored --quiet');
  violations.push('');
  for (const line of eslintFull.out.split('\n')) {
    if (line.trim()) violations.push(`  ${line}`);
  }
}

if (violations.length === 0) process.exit(0);

const summary = `Push blocked - full-project check failures:\n\n${violations.join('\n')}`;
process.stderr.write(summary + '\n');
process.stdout.write(summary);
process.exit(2);
