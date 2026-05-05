// pre_commit_secrets.mjs
// PreToolUse(Bash) hook — when the agent runs `git commit`, scans staged file
// diffs for secrets and blocks .env file staging outright.
// Exits 2 (BLOCK) if secrets are found, 0 otherwise.
//
// Line-level override: add `// allow-secret` or `# allow-secret` on the same
// line to suppress a match (e.g. for test fixtures and example values).

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
  const cmdString = [cmd, ...args.map(quoteIfNeeded)].join(' ');
  const res = spawnSync(cmdString, { cwd, encoding: 'utf8', shell: true });
  return { code: res.status ?? 0, out: (res.stdout || '') + (res.stderr || '') };
}

// Secret patterns with human-readable names.
const SECRET_PATTERNS = [
  { name: 'AWS access key', pattern: /(?:AKIA|ASIA|AROA|AIDA|AIPA|AGPA|ANPA|ANVA)[0-9A-Z]{16}/ },
  { name: 'GitHub token', pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/ },
  { name: 'Anthropic API key', pattern: /sk-ant-[a-zA-Z0-9_\-]{40,}/ },
  // Negative lookahead prevents matching Anthropic keys as OpenAI keys.
  { name: 'OpenAI API key', pattern: /sk-(?!ant-)[A-Za-z0-9]{40,}/ },
  { name: 'Slack token', pattern: /xox[baprs]-[0-9]+-[0-9]+-[0-9a-zA-Z]+/ },
  { name: 'Private key block', pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  {
    name: 'Generic credential assignment',
    pattern: /(?:api[_-]?key|secret|password|token|access[_-]?key)['"\s]*[:=]\s*['"][A-Za-z0-9+/=_\-]{24,}['"]/i,
  },
  { name: 'Database URL with credentials', pattern: /(?:postgres|mysql|mongodb):\/\/[^:]+:[^@]+@/i },
];

const BINARY_EXT = /\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|tar|gz|woff2?|ttf|otf|exe|dll|node|wasm)$/i;

function redact(line) {
  const first20 = line.slice(0, 20);
  return line.length > 20 ? `${first20}...REDACTED...` : first20;
}

const stdin = await readStdin();
if (!stdin.trim()) process.exit(0);

let data;
try { data = JSON.parse(stdin); } catch {
  process.stderr.write('pre_commit_secrets: invalid JSON on stdin\n');
  process.exit(0);
}

if (process.env.OUROBOROS_SKIP_QUALITY_HOOKS === '1') process.exit(0);

const command = data?.tool_input?.command;
if (!command || !/\bgit\s+commit\b/.test(command)) process.exit(0);

const gitTop = run('git', ['rev-parse', '--show-toplevel']);
const projectRoot = gitTop.code === 0 ? gitTop.out.trim() : null;
if (!projectRoot || !existsSync(join(projectRoot, 'package.json'))) {
  process.stderr.write('pre_commit_secrets: could not resolve project root with package.json\n');
  process.exit(0);
}

const stagedResult = run('git', ['diff', '--cached', '--name-only', '--diff-filter=d'], projectRoot);
const stagedFiles = stagedResult.out.split('\n').map((f) => f.trim()).filter(Boolean);
if (stagedFiles.length === 0) process.exit(0);

// Block .env file staging outright (except .env.example).
const blockedEnvFiles = stagedFiles.filter(
  (f) => /^\.env(?:\..*)?$/.test(f.split('/').pop()) && f.split('/').pop() !== '.env.example',
);
if (blockedEnvFiles.length > 0) {
  const msg = [
    'Commit blocked - staging of .env files is not permitted.',
    '',
    'Blocked files:',
    ...blockedEnvFiles.map((f) => `  ${f}`),
    '',
    'Add .env files to .gitignore. Use .env.example for documentation.',
  ].join('\n');
  process.stderr.write(msg + '\n');
  process.stdout.write(msg);
  process.exit(2);
}

// Scan staged diff additions for secrets.
const matches = [];

for (const file of stagedFiles) {
  if (BINARY_EXT.test(file)) continue;

  const diff = run('git', ['diff', '--cached', '-U0', '--', file], projectRoot);
  const addedLines = diff.out.split('\n').filter((l) => /^\+[^+]/.test(l));

  for (const rawLine of addedLines) {
    const line = rawLine.slice(1); // strip the leading '+' diff marker
    if (/\/\/ allow-secret/.test(line) || /# allow-secret/.test(line)) continue;

    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        matches.push({ file, patternName: name, snippet: redact(line.trim()) });
        break; // one violation per line is enough
      }
    }
  }
}

if (matches.length === 0) process.exit(0);

const matchLines = matches.map(
  (m) => `  [${m.patternName}] ${m.file}\n    Line content: ${m.snippet}`,
);

const msg = [
  `Commit blocked - ${matches.length} potential secret(s) found in staged diff:`,
  '',
  ...matchLines,
  '',
  'If these are test fixtures or example values, add `// allow-secret` (or `# allow-secret`)',
  'as a comment on the same line to suppress the check.',
  'If a real credential was staged, rotate it immediately — git history is not private.',
].join('\n');

process.stderr.write(msg + '\n');
process.stdout.write(msg);
process.exit(2);
