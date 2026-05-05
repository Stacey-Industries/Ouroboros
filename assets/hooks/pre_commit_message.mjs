// pre_commit_message.mjs
// PreToolUse(Bash) hook — when the agent runs `git commit`, validates the
// commit message first line against the conventional-commits format.
// Exits 2 (BLOCK) if the format is violated, 0 otherwise.
//
// Allowed auto-generated prefixes (no format required): Merge, Revert, fixup!, squash!
// Only the first line is validated; Co-Authored-By trailers and body text pass through.

async function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) { resolve(''); return; }
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolve(''));
  });
}

const CONVENTIONAL_RE =
  /^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)(\([a-z0-9_-]+\))?!?: .{1,}$/;

const AUTO_PREFIX_RE = /^(Merge |Revert |fixup! |squash! )/;

const EXAMPLES = [
  '  feat: add user authentication',
  '  fix(auth): handle expired token gracefully',
  '  chore(deps): bump react to 18.3',
  '  docs: update CONTRIBUTING.md',
  '  refactor(api)!: rename getUser to getUserProfile (BREAKING)',
];

function extractMessage(command) {
  // HEREDOC form: -m "$(cat <<'EOF'\n...\nEOF\n)"
  // The command arrives as a single string so the heredoc delimiters are literal.
  const heredocMatch = command.match(/<<'EOF'\n([\s\S]*?)\nEOF/);
  if (heredocMatch) return heredocMatch[1];

  // -m "..." double-quoted form (may contain escaped quotes \" internally)
  const doubleMatch = command.match(/-m\s+"((?:[^"\\]|\\.)*)"/);
  if (doubleMatch) return doubleMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');

  // -m '...' single-quoted form
  const singleMatch = command.match(/-m\s+'([^']*)'/);
  if (singleMatch) return singleMatch[1];

  return null;
}

const stdin = await readStdin();
if (!stdin.trim()) process.exit(0);

let data;
try { data = JSON.parse(stdin); } catch {
  process.stderr.write('pre_commit_message: invalid JSON on stdin\n');
  process.exit(0);
}

if (process.env.OUROBOROS_SKIP_QUALITY_HOOKS === '1') process.exit(0);

const command = data?.tool_input?.command;
if (!command || !/\bgit\s+commit\b/.test(command)) process.exit(0);

const message = extractMessage(command);
if (!message) {
  // No inline -m flag — interactive editor mode. Let git handle it normally.
  process.exit(0);
}

// Only validate the first line.
const firstLine = message.split('\n')[0].trim();

if (AUTO_PREFIX_RE.test(firstLine)) process.exit(0);
if (CONVENTIONAL_RE.test(firstLine)) process.exit(0);

const msg = [
  'Commit blocked - commit message does not follow conventional-commits format.',
  '',
  `Offending message: "${firstLine}"`,
  '',
  'Required format:',
  '  <type>[(<scope>)][!]: <description>',
  '',
  'Valid types: feat | fix | chore | docs | style | refactor | perf | test | build | ci | revert',
  '',
  'Examples:',
  ...EXAMPLES,
  '',
  'The ! suffix marks a breaking change. Scope is optional and must be lowercase.',
  'Only the first line is validated; body and Co-Authored-By trailers are free-form.',
].join('\n');

process.stderr.write(msg + '\n');
process.stdout.write(msg);
process.exit(2);
