// post_edit_test.mjs
// PostToolUse(Edit|Write|MultiEdit) hook — runs the matching vitest file
// (co-located or under __tests__/) for a 60s budget. Exits 2 (BLOCK) on test
// failures. Debounces same-test runs within 30s; pre-commit catches anything
// missed by the debounce.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';

const TIMEOUT_MS = 60_000;
const DEBOUNCE_SEC = 30;

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
  process.stderr.write('post_edit_test: invalid JSON on stdin\n');
  process.exit(0);
}

const filePath = data?.tool_input?.file_path || data?.tool_input?.filePath;
if (!filePath) process.exit(0);

if (!/\.(tsx?)$/.test(filePath)) process.exit(0);
if (/\.(test|spec)\.(tsx?)$/.test(filePath)) process.exit(0);
if (/\.d\.ts$/.test(filePath)) process.exit(0);
if (/\.config\./.test(filePath)) process.exit(0);
if (!filePath.replace(/\\/g, '/').includes('/src/')) process.exit(0);

const startDir = (() => {
  try { return dirname(resolve(filePath)); } catch { return dirname(filePath); }
})();

let projectRoot = null;
let cur = startDir;
while (cur && cur.length > 3) {
  if (existsSync(join(cur, 'package.json'))) { projectRoot = cur; break; }
  const next = dirname(cur);
  if (next === cur) break;
  cur = next;
}
if (!projectRoot) {
  process.stderr.write(`post_edit_test: could not find package.json above ${filePath}\n`);
  process.exit(0);
}

const dir = dirname(filePath);
const ext = extname(filePath);
const name = basename(filePath, ext);
const filename = basename(filePath);

const colocated = join(dir, `${name}.test${ext}`);
const underTests = join(dir, '__tests__', `${name}.test${ext}`);

let testFile = null;
if (existsSync(colocated)) testFile = colocated;
else if (existsSync(underTests)) testFile = underTests;
if (!testFile) process.exit(0);

const debounceDir = join(homedir(), '.claude', 'hooks', 'test-debounce');
try { mkdirSync(debounceDir, { recursive: true }); } catch { /* best-effort */ }

const testFileHash = createHash('sha256').update(testFile).digest('hex').slice(0, 16);
const debounceFile = join(debounceDir, `${testFileHash}.last`);

if (existsSync(debounceFile)) {
  try {
    const elapsedSec = (Date.now() - statSync(debounceFile).mtimeMs) / 1000;
    if (elapsedSec < DEBOUNCE_SEC) process.exit(0);
  } catch { /* fall through to run */ }
}

try { writeFileSync(debounceFile, '', 'utf8'); } catch { /* best-effort */ }

const killScript = join(projectRoot, 'scripts', 'kill-stale-vitest.mjs');
if (existsSync(killScript)) {
  await new Promise((resolve) => {
    const proc = spawn('node', [killScript], { cwd: projectRoot, stdio: 'ignore' });
    proc.on('close', () => resolve(undefined));
    proc.on('error', () => resolve(undefined));
  });
}

const testFilename = basename(testFile);

const result = await new Promise((resolve) => {
  let stdout = '';
  let stderr = '';
  let killed = false;
  // Single-string command form (see post_edit_eslint.mjs for rationale).
  const escaped = testFile.replace(/"/g, '\\"');
  const cmd = `npx vitest run "${escaped}" --reporter=verbose`;
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
  process.stderr.write(`post_edit_test: timed out after ${TIMEOUT_MS / 1000}s on ${testFilename}; failing open\n`);
  process.exit(0);
}

if (result.code !== 0 && result.output.trim()) {
  const lines = result.output.split('\n').map((l) => l.trim()).filter(Boolean);
  const tail = lines.slice(-20);
  process.stderr.write(`BLOCKED - Test failures in ${testFilename} (triggered by edit to ${filename}). Fix before continuing:\n`);
  process.stderr.write(tail.join('\n') + '\n');
  process.exit(2);
}

process.exit(0);
