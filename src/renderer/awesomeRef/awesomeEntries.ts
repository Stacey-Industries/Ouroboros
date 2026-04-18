/**
 * awesomeEntries.ts — Seed data for AWESOME_ENTRIES.
 *
 * Wave 37 Phase E. Separated from awesomeData.ts to stay under the 300-line
 * ESLint max-lines limit. Import via awesomeData.ts — not directly.
 */

import type { AwesomeEntry } from './awesomeData';

// ── Hooks ─────────────────────────────────────────────────────────────────────

const HOOK_ENTRIES: AwesomeEntry[] = [
  {
    id: 'hook-auto-format-on-save',
    category: 'hooks',
    title: 'Auto-format on save',
    description:
      'Runs Prettier on any .ts/.tsx/.js file written by the agent. '
      + 'Place in ~/.claude/hooks/PostToolUse.',
    author: 'ouroboros-team',
    tags: ['formatting', 'prettier', 'typescript'],
    content: '#!/usr/bin/env bash\n'
      + '# PostToolUse — auto-format written files with Prettier\n'
      + 'FILE="$(echo "$CLAUDE_TOOL_INPUT" | jq -r \'.path // empty\')"\n'
      + 'if [[ "$FILE" =~ \\.(ts|tsx|js|jsx)$ ]] && command -v prettier &>/dev/null; then\n'
      + '  prettier --write "$FILE" --log-level warn\n'
      + 'fi\n',
    installAction: { kind: 'hook', payload: { eventType: 'PostToolUse', command: 'auto-format.sh' } },
  },
  {
    id: 'hook-block-env-writes',
    category: 'hooks',
    title: 'Block .env writes',
    description:
      'Rejects any Write tool call targeting a .env file. '
      + 'Prevents accidental secret injection. Place in ~/.claude/hooks/PreToolUse.',
    author: 'ouroboros-team',
    tags: ['security', 'env', 'guard'],
    content: '#!/usr/bin/env bash\n'
      + '# PreToolUse — block writes to .env files\n'
      + 'FILE="$(echo "$CLAUDE_TOOL_INPUT" | jq -r \'.path // empty\')"\n'
      + 'if [[ "$FILE" == *.env* ]]; then\n'
      + '  echo \'{"decision":"block","reason":"Direct .env writes are not allowed."}\' >&2\n'
      + '  exit 2\n'
      + 'fi\n',
    installAction: { kind: 'hook', payload: { eventType: 'PreToolUse', command: 'block-env.sh' } },
  },
  {
    id: 'hook-slack-session-end',
    category: 'hooks',
    title: 'Slack notify on session end',
    description:
      'POSTs a Slack webhook when a Claude Code session stops. '
      + 'Set SLACK_WEBHOOK_URL in your environment.',
    author: 'ouroboros-team',
    tags: ['slack', 'notification', 'session'],
    content: '#!/usr/bin/env bash\n'
      + '# PostSessionStop — notify Slack when session ends\n'
      + 'if [[ -n "$SLACK_WEBHOOK_URL" ]]; then\n'
      + '  SESSION="$CLAUDE_SESSION_ID"\n'
      + '  curl -s -X POST "$SLACK_WEBHOOK_URL" \\\n'
      + '    -H \'Content-Type: application/json\' \\\n'
      + '    -d "{\\"text\\":\\"Claude Code session ended: ${SESSION}\\"}" > /dev/null\n'
      + 'fi\n',
    installAction: { kind: 'hook', payload: { eventType: 'PostSessionStop', command: 'slack-notify.sh' } },
  },
  {
    id: 'hook-daily-log',
    category: 'hooks',
    title: 'Append to daily log',
    description:
      'Appends a timestamped line to ~/.ouroboros/daily.log after each session stop.',
    author: 'ouroboros-team',
    tags: ['logging', 'audit', 'session'],
    content: '#!/usr/bin/env bash\n'
      + '# PostSessionStop — append session summary to daily log\n'
      + 'LOG_DIR="$HOME/.ouroboros"\n'
      + 'mkdir -p "$LOG_DIR"\n'
      + 'echo "$(date -Iseconds) session=$CLAUDE_SESSION_ID cost=$CLAUDE_TOTAL_COST_USD" \\\n'
      + '  >> "$LOG_DIR/daily.log"\n',
    installAction: { kind: 'hook', payload: { eventType: 'PostSessionStop', command: 'daily-log.sh' } },
  },
];

// ── Slash commands ────────────────────────────────────────────────────────────

const COMMAND_ENTRIES: AwesomeEntry[] = [
  {
    id: 'cmd-spec',
    category: 'slash-commands',
    title: '/spec',
    description:
      'Kicks off a specplan for the current task. Prompts for a feature '
      + 'description, then generates a phase breakdown.',
    author: 'ouroboros-team',
    tags: ['planning', 'spec', 'workflow'],
    content: 'You are a senior engineer. The user wants to spec out a feature.\n\n'
      + 'Ask them: "What feature or change do you want to plan?"\n\n'
      + 'Once they answer, produce:\n'
      + '1. A short goal statement (1-2 sentences).\n'
      + '2. A phase breakdown table: | Phase | Scope | Key files |\n'
      + '3. Acceptance criteria (bullet list).\n'
      + '4. Known risks or open questions.\n\n'
      + 'Keep it concise. Do not start implementing yet.\n',
    installAction: { kind: 'skill', payload: { scope: 'global', name: 'spec' } },
  },
  {
    id: 'cmd-review',
    category: 'slash-commands',
    title: '/review',
    description:
      'Reviews the current staged diff for correctness, style, and missing tests.',
    author: 'ouroboros-team',
    tags: ['review', 'git', 'quality'],
    content: 'Run: git diff --staged\n\n'
      + 'Review the staged changes for:\n'
      + '- Correctness: logic bugs, off-by-one errors, null dereferences.\n'
      + '- Style: naming, ESLint compliance, dead code.\n'
      + '- Coverage gaps: are there test files covering the changed logic?\n'
      + '- Security: secrets, injection, unsafe eval.\n\n'
      + 'Output a concise bullet list grouped by severity: CRITICAL / WARNING / NOTE.\n',
    installAction: { kind: 'skill', payload: { scope: 'global', name: 'review' } },
  },
  {
    id: 'cmd-test-changes',
    category: 'slash-commands',
    title: '/test-changes',
    description: 'Runs vitest only on test files adjacent to changed source files.',
    author: 'ouroboros-team',
    tags: ['testing', 'vitest', 'ci'],
    content: 'Determine which source files changed since the last commit:\n'
      + '  git diff --name-only HEAD\n\n'
      + 'For each changed file foo.ts, check whether foo.test.ts exists nearby.\n'
      + 'Collect those test files, then run:\n'
      + '  npx vitest run <test-file-list>\n\n'
      + 'Report the results. Do not run the full suite.\n',
    installAction: { kind: 'skill', payload: { scope: 'global', name: 'test-changes' } },
  },
  {
    id: 'cmd-migrate',
    category: 'slash-commands',
    title: '/migrate',
    description: 'Generates a migration checklist for renaming or moving a module.',
    author: 'ouroboros-team',
    tags: ['refactor', 'migration', 'rename'],
    content: 'The user wants to migrate/rename a module. Ask:\n'
      + '1. What is the current file path?\n'
      + '2. What is the new path or name?\n\n'
      + 'Then produce a migration checklist:\n'
      + '- [ ] Rename the file\n'
      + '- [ ] Update all import statements (show grep command)\n'
      + '- [ ] Update barrel exports\n'
      + '- [ ] Update path aliases if applicable\n'
      + '- [ ] Run tsc --noEmit to verify\n'
      + '- [ ] Update tests that reference the old path\n',
    installAction: { kind: 'skill', payload: { scope: 'global', name: 'migrate' } },
  },
];

// ── MCP configs ──────────────────────────────────────────────────────────────

const MCP_ENTRIES: AwesomeEntry[] = [
  {
    id: 'mcp-linear',
    category: 'mcp-configs',
    title: 'Linear MCP',
    description: 'Gives Claude Code access to your Linear workspace: issues, cycles, and teams.',
    author: 'ouroboros-team',
    tags: ['linear', 'project-management', 'issues'],
    content: '{\n  "mcpServers": {\n    "linear": {\n'
      + '      "command": "npx",\n      "args": ["-y", "@linear/mcp-server"],\n'
      + '      "env": { "LINEAR_API_KEY": "<your-linear-api-key>" }\n    }\n  }\n}',
  },
  {
    id: 'mcp-github',
    category: 'mcp-configs',
    title: 'GitHub MCP',
    description: 'Lets Claude Code read/create issues and PRs in your GitHub repos.',
    author: 'ouroboros-team',
    tags: ['github', 'prs', 'issues'],
    content: '{\n  "mcpServers": {\n    "github": {\n'
      + '      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-github"],\n'
      + '      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "<your-pat>" }\n    }\n  }\n}',
  },
  {
    id: 'mcp-slack',
    category: 'mcp-configs',
    title: 'Slack MCP',
    description: 'Allows Claude Code to read Slack channels and post messages on your behalf.',
    author: 'ouroboros-team',
    tags: ['slack', 'messaging', 'notifications'],
    content: '{\n  "mcpServers": {\n    "slack": {\n'
      + '      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-slack"],\n'
      + '      "env": { "SLACK_BOT_TOKEN": "<your-bot-token>", "SLACK_TEAM_ID": "<your-team-id>" }\n    }\n  }\n}',
  },
];

// ── Rules ─────────────────────────────────────────────────────────────────────

const RULE_ENTRIES: AwesomeEntry[] = [
  {
    id: 'rule-no-secrets-in-logs',
    category: 'rules',
    title: 'No secrets in logs',
    description: 'Instructs the agent never to log, echo, or print values from .env files.',
    author: 'ouroboros-team',
    tags: ['security', 'secrets', 'logging'],
    content: '# No Secrets Rule (**/.env*)\n\n'
      + '- MUST NOT log, print, echo, or commit values from .env files\n'
      + '- MUST NOT modify .env files without explicit user instruction\n'
      + '- MUST NOT create new .env files — ask user to create manually\n'
      + '- If a secret is needed for testing, use placeholder: sk-test-placeholder\n',
    installAction: { kind: 'rule', payload: { scope: 'global', name: 'no-secrets', content: '' } },
  },
  {
    id: 'rule-conventional-commits',
    category: 'rules',
    title: 'Conventional commits',
    description: 'Enforces the Conventional Commits specification for all commit messages.',
    author: 'ouroboros-team',
    tags: ['git', 'commits', 'changelog'],
    content: '# Conventional Commits Rule\n\n'
      + 'All commit messages MUST follow the Conventional Commits format:\n\n'
      + '  <type>(<scope>): <short summary>\n\n'
      + 'Allowed types: feat, fix, docs, style, refactor, test, chore, perf, ci, build.\n'
      + 'Breaking changes: append ! after type or add BREAKING CHANGE: footer.\n',
    installAction: { kind: 'rule', payload: { scope: 'global', name: 'conventional-commits', content: '' } },
  },
  {
    id: 'rule-no-compat-shims',
    category: 'rules',
    title: 'No backward-compat shims',
    description: 'Prevents the agent from adding legacy shim code without explicit approval.',
    author: 'ouroboros-team',
    tags: ['code-quality', 'refactor', 'legacy'],
    content: '# No Backward-Compat Shims Rule\n\n'
      + '- Do NOT add shim code to preserve a deprecated API unless the user explicitly requests it.\n'
      + '- When removing a function, update ALL callers immediately.\n'
      + '- If a migration would be large, stop and surface the scope to the user first.\n'
      + '- Exceptions must be documented with a // COMPAT: <reason> comment.\n',
    installAction: { kind: 'rule', payload: { scope: 'global', name: 'no-compat-shims', content: '' } },
  },
];

// ── Skills ────────────────────────────────────────────────────────────────────

const SKILL_ENTRIES: AwesomeEntry[] = [
  {
    id: 'skill-changelog-generator',
    category: 'skills',
    title: 'Changelog generator',
    description: 'Generates a CHANGELOG entry from git log between two refs.',
    author: 'ouroboros-team',
    tags: ['changelog', 'git', 'release'],
    content: 'You are generating a CHANGELOG entry. The user will provide FROM_REF and TO_REF.\n\n'
      + 'Steps:\n'
      + '1. Run: git log <FROM_REF>..<TO_REF> --oneline --no-merges\n'
      + '2. Group commits by conventional-commit type (feat, fix, refactor, etc.)\n'
      + '3. Output markdown:\n\n'
      + '## [<version>] - <YYYY-MM-DD>\n'
      + '### Added\n- ...\n### Fixed\n- ...\n### Changed\n- ...\n\n'
      + 'Omit sections with no entries.\n',
    installAction: { kind: 'skill', payload: { scope: 'global', name: 'changelog-generator', content: '' } },
  },
  {
    id: 'skill-dependency-auditor',
    category: 'skills',
    title: 'Dependency auditor',
    description: 'Reviews package.json for outdated, unused, or vulnerable dependencies.',
    author: 'ouroboros-team',
    tags: ['dependencies', 'audit', 'security'],
    content: 'Audit the project dependencies:\n\n'
      + '1. Read package.json (dependencies + devDependencies).\n'
      + '2. Run: npm outdated --json\n'
      + '3. Run: npm audit --json (filter severity >= moderate)\n'
      + '4. Grep imports vs listed deps to find unused packages.\n\n'
      + 'Produce a table: | Package | Current | Latest | Severity | Action |\n'
      + 'Recommended actions: upgrade, remove, review, ignore.\n'
      + 'Do not auto-upgrade — only report.\n',
    installAction: { kind: 'skill', payload: { scope: 'global', name: 'dependency-auditor', content: '' } },
  },
  {
    id: 'skill-test-scaffolder',
    category: 'skills',
    title: 'Test scaffolder',
    description: 'Generates a vitest test file scaffold for a given source file.',
    author: 'ouroboros-team',
    tags: ['testing', 'vitest', 'scaffold'],
    content: 'You are scaffolding a vitest test file. The user provides a source file path.\n\n'
      + '1. Read the source file.\n'
      + '2. Identify exported functions, classes, and hooks.\n'
      + '3. Generate a test file co-located with the source (same directory, .test.ts suffix).\n\n'
      + 'Use describe/it/expect from vitest. Add one describe block per exported symbol.\n'
      + 'Leave TODOs for edge cases. Do not use jest APIs.\n',
    installAction: { kind: 'skill', payload: { scope: 'global', name: 'test-scaffolder', content: '' } },
  },
];

// ── Combined export ───────────────────────────────────────────────────────────

export const ALL_ENTRIES: readonly AwesomeEntry[] = [
  ...HOOK_ENTRIES,
  ...COMMAND_ENTRIES,
  ...MCP_ENTRIES,
  ...RULE_ENTRIES,
  ...SKILL_ENTRIES,
];
