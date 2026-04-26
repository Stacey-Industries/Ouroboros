// post_edit_eslint.mjs
// PostToolUse(Edit|Write|MultiEdit) hook — runs ESLint on the changed file
// with a 30s wall-clock budget. Exits 2 (BLOCK) on violations so the agent
// fixes them in the same turn. Skipped on test/declaration/non-TS files.

import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const TIMEOUT_MS = 30_000;

if (process.env.OUROBOROS_SKIP_QUALITY_HOOKS === '1') process.exit(0);

async function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) { resolve(''); return; }
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolve(''));
  });
}

const stdin = await readStdin();
if (!stdin.trim()) process.exit(0);

let data;
try { data = JSON.parse(stdin); } catch {
  process.stderr.write('post_edit_eslint: invalid JSON on stdin\n');
  process.exit(0);
}

const filePath = data?.tool_input?.file_path || data?.tool_input?.filePath;
if (!filePath) process.exit(0);

if (!/\.(tsx?)$/.test(filePath)) process.exit(0);
if (/\.(test|spec)\.(tsx?)$/.test(filePath)) process.exit(0);
if (/\.d\.ts$/.test(filePath)) process.exit(0);

const startDir = (() => {
  try { return dirname(resolve(filePath)); } catch { return dirname(filePath); }
})();

let projectRoot = null;
let cur = startDir;
while (cur && cur.length > 3) {
  if (existsSync(resolve(cur, 'package.json'))) { projectRoot = cur; break; }
  const next = dirname(cur);
  if (next === cur) break;
  cur = next;
}
if (!projectRoot) {
  process.stderr.write(`post_edit_eslint: could not find package.json above ${filePath}\n`);
  process.exit(0);
}

const result = await new Promise((resolve) => {
  let stdout = '';
  let stderr = '';
  let killed = false;
  // Single-string command form to avoid (a) Windows .cmd shim issues with
  // shell:false (EINVAL on spawn) and (b) DEP0190 array-arg concatenation
  // warning. The shell parses the string with our explicit quoting around
  // paths-with-spaces — safer and simpler than fighting argv boundaries.
  const escaped = filePath.replace(/"/g, '\\"');
  const cmd = `npx eslint --no-warn-ignored "${escaped}"`;
  const proc = spawn(cmd, { cwd: projectRoot, shell: true });
  const timer = setTimeout(() => {
    killed = true;
    try { proc.kill('SIGKILL'); } catch { /* best-effort */ }
  }, TIMEOUT_MS);
  proc.stdout.on('data', (c) => { stdout += c; });
  proc.stderr.on('data', (c) => { stderr += c; });
  proc.on('close', (code) => {
    clearTimeout(timer);
    resolve({ code: code ?? 0, output: stdout + stderr, killed });
  });
  proc.on('error', () => {
    clearTimeout(timer);
    resolve({ code: 0, output: '', killed: false });
  });
});

if (result.killed) {
  process.stderr.write(`post_edit_eslint: timed out after ${TIMEOUT_MS / 1000}s; failing open\n`);
  process.exit(0);
}

if (result.code !== 0 && result.output.trim()) {
  const lines = result.output.split('\n').map((l) => l.trim()).filter(Boolean);
  const tail = lines.slice(-20);
  const filename = filePath.split(/[\\/]/).pop();
  process.stderr.write(`BLOCKED - ESLint violations in ${filename}. Fix these before continuing:\n`);
  process.stderr.write(tail.join('\n') + '\n');
  process.exit(2);
}

process.exit(0);
