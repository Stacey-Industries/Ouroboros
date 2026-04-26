// post_write_test_required.mjs
// PostToolUse(Write) hook — requires a co-located test file for new source
// files. Exits 2 (BLOCK) if absent so the agent creates tests before moving
// on. Skips trivial files (under 10 lines), index.ts, /types/, /_test_mocks/,
// .config.*, .d.ts, and existing test files.

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

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
  process.stderr.write('post_write_test_required: invalid JSON on stdin\n');
  process.exit(0);
}

const filePath = data?.tool_input?.file_path || data?.tool_input?.filePath;
if (!filePath) process.exit(0);

if (!/\.(tsx?)$/.test(filePath)) process.exit(0);
if (/\.(test|spec)\.(tsx?)$/.test(filePath)) process.exit(0);
if (/\.d\.ts$/.test(filePath)) process.exit(0);
if (/\.config\./.test(filePath)) process.exit(0);

const normalized = filePath.replace(/\\/g, '/');
if (!normalized.includes('/src/')) process.exit(0);
if (normalized.includes('/types/')) process.exit(0);
if (normalized.includes('/_test_mocks/')) process.exit(0);

const filename = basename(filePath);
if (/^index\.(tsx?)$/.test(filename)) process.exit(0);

if (existsSync(filePath)) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const lineCount = content.split('\n').filter((l) => l.trim()).length;
    if (lineCount < 10) process.exit(0);
  } catch { /* fall through to test check */ }
}

const dir = dirname(filePath);
const ext = extname(filePath);
const name = basename(filePath, ext);

const colocated = join(dir, `${name}.test${ext}`);
const underTests = join(dir, '__tests__', `${name}.test${ext}`);

if (existsSync(colocated) || existsSync(underTests)) process.exit(0);

process.stderr.write(`BLOCKED - New source file has no tests: ${filename}\n`);
process.stderr.write(`Create ${name}.test${ext} with smoke tests covering the acceptance criteria.\n`);
process.stderr.write(`Co-locate it at: ${colocated}\n`);
process.exit(2);
