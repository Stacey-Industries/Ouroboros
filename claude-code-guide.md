# Claude Code Automation Guide

A plain-English guide to everything Claude Code offers for automating your workflow. Written for someone who's been coding with Claude but didn't realize how much could be running on autopilot.

---

## The Big Picture

Claude Code has **6 automation layers**. Think of them like a building:

```
  SKILLS         Polished, reusable agent workflows (plugins)
  COMMANDS       Saved prompts you trigger manually
  RULES          Context injected when you touch matching files
  HOOKS          Scripts that run automatically at lifecycle events
  CLAUDE.md      Always-loaded project context
  SETTINGS       Permissions, model config, plugin toggles
```

Each layer does something different. Here's when to use each.

---

## 1. CLAUDE.md — The Project Brain

**What it is:** A markdown file at your project root that Claude reads at the start of every conversation. It's always loaded — every message, every session.

**Where it lives:**
- `CLAUDE.md` in your project root (shared with team via git)
- `~/.claude/CLAUDE.md` (personal, applies to all projects)

**What to put in it:**
- Things Claude gets wrong without being told
- Non-obvious project quirks ("we use @xterm/xterm, NOT the legacy xterm package")
- Build commands with specific flags
- Architectural decisions and WHY they were made

**What NOT to put in it:**
- Rules you want enforced (use hooks — CLAUDE.md is a suggestion, hooks are law)
- Things obvious from the code ("this is a TypeScript project")
- Generic best practices ("write clean code")
- Anything you'd put in a rule file (saves tokens by not loading when irrelevant)

**Example:**
```markdown
# My Project

Electron app with three processes. Built by Claude Code from within itself.

## Critical
- NEVER kill Electron processes — you're running inside one
- xterm.js needs double-rAF after term.open() before fit()
- Web build order: vite.web.config.ts THEN vite.webpreload.config.ts

## Commands
- npm run dev — hot-reload (don't restart the app, just Ctrl+R)
- npm test — vitest
- npm run build — electron-vite production build
```

**When to add to it:** When Claude makes the same mistake twice. That's a signal it needs permanent context.

**When NOT to add to it:** When a hook or rule would handle it better. Ask: "Am I telling Claude to do something, or telling Claude about something?" If doing → hook. If about → CLAUDE.md.

---

## 2. Hooks — Automatic Scripts at Lifecycle Events

**What they are:** Shell scripts that run automatically when specific things happen. Claude doesn't choose whether they run — they ALWAYS run. That's what makes them powerful.

**Where they live:**

| Level | Config file | Script location | Scope |
|---|---|---|---|
| Global | `~/.claude/settings.json` | `~/.claude/hooks/` | Every project, every session |
| Project (shared) | `.claude/settings.json` | `assets/hooks/` or `.claude/hooks/` | This project, all team members |
| Project (personal) | `.claude/settings.local.json` | anywhere | This project, only you |

Yes — hooks have both global and project levels. Global hooks fire everywhere. Project hooks fire only in that project. Both can coexist (they stack).

**Available events (13 total):**

| Event | When it fires | What you'd use it for |
|---|---|---|
| `SessionStart` | New conversation begins | Inject git status, load context |
| `UserPromptSubmit` | After you type, before Claude thinks | Validate input, inject context, suggest skills |
| `PreToolUse` | Before Claude runs a tool | **BLOCK dangerous commands** (exit 2 = hard stop) |
| `PostToolUse` | After a tool succeeds | Run linters, formatters, tests on changed files |
| `PostToolUseFailure` | After a tool fails | Log failures, detect loops |
| `PreCompact` | Before conversation compression | Save critical context to a file |
| `Notification` | Claude needs your attention | Desktop notification, sound alert |
| `SubagentStart` | A subagent spawns | Track/monitor subagents |
| `SubagentStop` | A subagent finishes | Track/monitor subagents |
| `Stop` | Claude finishes responding | Desktop notification, cleanup |
| `PermissionRequest` | Claude asks for permission | Audit logging |
| `Setup` | One-time initialization | Install tools, check environment |
| `SessionEnd` | Conversation ends | Final cleanup |

**How they work:**

1. The event fires
2. Claude Code passes JSON data to your script via stdin (tool name, file path, session ID, etc.)
3. Your script does its thing
4. Exit code matters:
   - `0` = OK, continue
   - `2` = BLOCK this action (PreToolUse only)
   - `1` = warning (logged but not blocking)
5. Anything your script writes to stdout gets injected into Claude's context

**Example — Block dangerous commands (global):**

In `~/.claude/settings.json`:
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "powershell -File ~/.claude/hooks/security_gate.ps1"
          }
        ]
      }
    ]
  }
}
```

The script reads the command from stdin JSON, checks against dangerous patterns (`rm -rf /`, `git push --force`, `taskkill`), and exits 2 to block or 0 to allow.

**Example — Run ESLint after every edit (project):**

In `.claude/settings.local.json`:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "powershell -File assets/hooks/post_edit_eslint.ps1"
          }
        ]
      }
    ]
  }
}
```

The script extracts the file path, runs `npx eslint <file>`, and outputs violations. Claude sees the output and fixes them immediately. This is a feedback loop — it runs again on the fix, confirms it passes, done.

**Example — Desktop notification when done (global):**

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "powershell -c \"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('Claude finished','Done')\""
          }
        ]
      }
    ]
  }
}
```

**The `matcher` field:**

Filters which tool triggers the hook. Uses regex.
- `"Bash"` — only Bash commands
- `"Edit|Write"` — Edit or Write tools
- `"Edit|Write|MultiEdit"` — any file modification
- `""` or omitted — fires on everything

**Hook types (4 total):**

| Type | What it does | Example use |
|---|---|---|
| `command` | Runs a shell script | Linting, formatting, notifications |
| `prompt` | Asks an LLM to evaluate something | "Is this edit safe?" |
| `agent` | Spawns a multi-turn subagent | Deep code review before PR |
| `http` | POSTs to a webhook URL | Slack notification, CI trigger |

**When to add a hook:**
- "I want this to happen EVERY TIME, no exceptions" → Hook
- "Claude keeps forgetting to do X after editing" → PostToolUse hook
- "I never want Claude to run Y command" → PreToolUse hook with exit 2
- "I want to know when Claude finishes" → Stop/Notification hook
- "I want an audit trail" → PreToolUse logging hook

---

## 3. Rules — Context Injected When Relevant

**What they are:** Markdown files with a glob pattern. When Claude works with files matching the pattern, the rule's content gets injected into context. When working on unrelated files, the rule is invisible — saving tokens.

**Where they live:**

| Level | Location | Scope |
|---|---|---|
| Global | `~/.claude/rules/*.md` | Every project |
| Project | `.claude/rules/*.md` | This project only |

Yes — rules also have global and project levels.

**How they work:**

Each rule file has YAML frontmatter with a `globs` field:

```markdown
---
globs: src/main/**/*.ts
---

# Main Process Rules

- This is Node.js code. Never import from @renderer/*.
- Use ipcMain.handle for request/response patterns.
- Security plugin (eslint-plugin-security) is enforced at error level.
- Functions: max 40 lines, max complexity 10, max depth 3.
```

When Claude reads or edits a file in `src/main/`, this rule appears in context. When Claude is working on renderer code, this rule is absent.

**Example — Renderer code (project rule):**
```markdown
---
globs: src/renderer/**/*.{ts,tsx}
---

# Renderer Rules

- Browser environment: no Node.js APIs (no require, no fs, no path)
- Use window.electronAPI for all IPC (defined in preload)
- Tailwind utilities only — never hardcode hex colors
- Design tokens: surface-*, text-semantic-*, interactive-*, status-*
- Functions: max 40 lines, complexity max 10
```

**Example — Never edit .env files (global rule):**
```markdown
---
globs: **/.env*
---

# Environment Files

- MUST NOT log, print, or echo values from this file
- MUST NOT modify without explicit user instruction
- MUST NOT commit to git
- If you need a value for testing, use a placeholder like `sk-test-placeholder`
```

**Example — Test files (project rule):**
```markdown
---
globs: src/**/*.test.ts
---

# Test Conventions

- Framework: vitest (not jest, not mocha)
- max-lines-per-function and max-lines are OFF for test files
- Test behavior, not implementation
- Colocate with source: foo.ts + foo.test.ts in same directory
```

**Rules vs CLAUDE.md — when to use which:**

| Use a rule when... | Use CLAUDE.md when... |
|---|---|
| The context only matters for certain files | The context matters for ALL files |
| You're describing conventions for a subsystem | You're describing the whole project |
| The content is >5 lines of specific guidance | The content is a 1-liner |
| You want to save tokens on unrelated work | The info is needed in every conversation |

**When to add a rule:**
- "When Claude edits files in X folder, it keeps doing Y wrong" → Rule with glob for that folder
- "Claude doesn't know our ESLint config" → Rule with the constraints for matching file types
- "Claude treats test files like production code" → Rule for `**/*.test.ts`
- "Claude edits lockfiles manually" → Rule saying don't

---

## 4. Commands — Saved Prompts You Trigger Manually

**What they are:** Markdown files that become slash commands. You type the command name, the markdown content becomes your prompt. That's it — they're saved prompts.

**Where they live:**

| Level | Location | Invocation |
|---|---|---|
| Global | `~/.claude/commands/*.md` | `/user:filename` |
| Project | `.claude/commands/*.md` | `/project:filename` |

**How they work:**

Create a file, get a command:

```markdown
<!-- File: ~/.claude/commands/tdd.md -->

Follow a strict TDD cycle for: $ARGUMENTS

1. RED: Write a failing test that describes the expected behavior
2. GREEN: Write the minimum code to make the test pass
3. REFACTOR: Improve the code while keeping tests green
4. VERIFY: Run the full test suite to ensure no regressions

After each phase, show me what you did and wait for confirmation.
```

Now you type `/user:tdd validate email addresses` and Claude gets that full prompt with "validate email addresses" substituted for `$ARGUMENTS`.

**Project command example:**

```markdown
<!-- File: .claude/commands/blast-radius.md -->

Run impact analysis on current uncommitted changes:

1. Use detect_changes from codebase-memory-mcp to find affected symbols
2. For CRITICAL/HIGH risk symbols, run trace_call_path
3. Check if tests exist for affected code
4. Summarize: files affected, risk levels, test coverage gaps

$ARGUMENTS
```

Now `/project:blast-radius` runs your custom impact analysis using your project's codebase graph.

**More examples:**

| Command | What it does |
|---|---|
| `/user:review` | Multi-perspective code review (architecture, security, performance) |
| `/user:explain` | Deep explanation — callers, design decisions, gotchas |
| `/user:smart-fix` | Describe a bug → diagnose → fix → test |
| `/project:pre-commit` | Typecheck + lint + test changed files |
| `/project:safe-check` | Check for process boundary violations, hardcoded colors |

**Commands vs just typing the prompt:**

They're the same thing mechanically. Commands are useful because:
1. You don't have to remember or retype complex prompts
2. They're version-controlled (share with team via git)
3. They standardize workflows (everyone runs the same review process)
4. `$ARGUMENTS` makes them flexible

**When to add a command:**
- "I keep typing the same multi-step prompt" → Save it as a command
- "I want everyone on the team to run reviews the same way" → Project command
- "I have a workflow that requires specific tools/steps" → Command

---

## 5. Skills — Plugin-Powered Agent Workflows

**What they are:** Polished, reusable agent definitions packaged as plugins. They're like commands on steroids — they can specify which model to use, which tools to allow, and can auto-trigger based on what you're doing.

**Where they come from:** Installed via `enabledPlugins` in `~/.claude/settings.json`. You enable them like apps on a phone.

**How they differ from commands:**

| | Commands | Skills |
|---|---|---|
| You create them | Yes — write a .md file | No — install from plugins |
| Must be triggered manually | Yes — /project:name | Not always — can auto-trigger |
| Choose the model | No — uses current session model | Yes — can route to haiku/sonnet/opus |
| Restrict tools | No — has access to everything | Yes — can limit to specific tools |
| Has conversation context | Yes — runs in your conversation | Maybe not — may run as isolated subagent |
| Complexity | Simple prompt template | Full agent with frontmatter metadata |

**Skills you already have enabled:**

| Skill | What it does | How to use |
|---|---|---|
| `/commit` | Stage changes, generate message, commit | Type `/commit` |
| `/feature-dev` | Guided feature development | Type `/feature-dev` |
| `/code-review` | Code review with standards checking | Type `/code-review` |
| `/simplify` | Review and simplify changed code | Type `/simplify` |
| `/lint-fix` | Fix lint violations | Type `/lint-fix` |
| `claude-api` | Help with Anthropic SDK code | Auto-triggers when you import `anthropic` |
| `frontend-design` | Create polished UI components | Type or auto-triggers on frontend work |

**When to use a skill vs a command:**
- **Skill:** Cross-project, benefits from model routing or tool restrictions, polished workflow
- **Command:** Project-specific, needs conversation context, simple prompt

**How to create custom skills:**

You have the `skill-creator` plugin enabled. Type `/skill-creator` to build one with YAML frontmatter:

```yaml
---
name: my-custom-skill
description: Does a specific thing when triggered
model: sonnet
allowed-tools:
  - Read
  - Grep
  - Agent
---

[Your prompt template here]
```

**When to add a skill:**
- "I want this workflow across ALL my projects with specific model/tool constraints"
- "I want this to auto-trigger when I'm doing X"
- In practice: rarely — commands cover most needs. Skills are for polished, shared workflows.

---

## 6. Settings — The Foundation

**What they are:** JSON configuration files that control permissions, hooks, plugins, and behavior.

**Where they live:**

| File | Scope | Git-tracked? |
|---|---|---|
| `~/.claude/settings.json` | All projects (user-level) | No |
| `~/.claude/settings.local.json` | All projects (personal overrides) | No |
| `.claude/settings.json` | This project (team-shared) | Yes |
| `.claude/settings.local.json` | This project (personal) | No (.gitignore) |

**What goes in settings:**
- `permissions` — which tools/commands are auto-allowed
- `hooks` — hook event configurations (see section 2)
- `enabledPlugins` — which skills/plugins are active
- `effortLevel` — how thorough responses should be
- `statusLine` — custom info bar in the terminal

**Precedence (first match wins):**
1. Project local (`.claude/settings.local.json`)
2. Project shared (`.claude/settings.json`)
3. User local (`~/.claude/settings.local.json`)
4. User shared (`~/.claude/settings.json`)

---

## Decision Flowchart

When you want Claude to behave differently, ask yourself:

```
Is this something Claude should ALWAYS know about this project?
  YES → CLAUDE.md

Is this a rule for specific files/folders only?
  YES → Rule file with glob pattern

Should this happen AUTOMATICALLY every time, no exceptions?
  YES → Hook (PreToolUse to block, PostToolUse to react)

Is this a workflow I trigger manually?
  YES → Command (.claude/commands/)

Does it need model routing, tool restrictions, or auto-triggering?
  YES → Skill (plugin)

Should it apply to ALL projects or just this one?
  ALL → Global (~/.claude/)
  THIS → Project (.claude/)
```

---

## Common Patterns

### "Claude keeps writing functions that are too long"
- **Rule** for `src/**/*.ts` with your ESLint limits (proactive — Claude reads them first)
- **Hook** PostToolUse running ESLint (reactive — catches what rules miss)
- Both together = rarely need manual cleanup

### "Claude sometimes runs dangerous commands"
- **Hook** PreToolUse on Bash with exit 2 to block dangerous patterns
- Can't be bypassed — it's deterministic, not a suggestion

### "I want to run the same review process every time"
- **Command** at `~/.claude/commands/review.md`
- Type `/user:review` and get the same multi-step process every time

### "Claude doesn't know about our test conventions"
- **Rule** for `**/*.test.ts` with your vitest conventions
- Only loaded when Claude is working on test files

### "I want a notification when Claude finishes"
- **Hook** on Stop event with a desktop notification script
- Fires every time, every project

### "Claude edits .env files and leaks secrets"
- **Rule** for `**/.env*` saying never modify
- **Hook** PreToolUse on Edit|Write to block .env edits entirely (belt AND suspenders)

### "I want Claude to lint code before committing"
- **Hook** PreToolUse on Bash, detect `git commit`, run ESLint, exit 2 if it fails
- Commit is physically blocked until lint passes

---

## Summary Table

| Layer | Scope options | Triggered by | Can block actions? | Token cost |
|---|---|---|---|---|
| CLAUDE.md | Project / User | Always loaded | No | Always spent |
| Rules | Project / User (global) | File glob match | No | Only when relevant |
| Hooks | Project / User (global) | Lifecycle events | Yes (PreToolUse exit 2) | Zero (runs externally) |
| Commands | Project / User (global) | You type /name | No | On-demand |
| Skills | Global (plugins) | You type /name or auto-trigger | No | On-demand |
| Settings | Project / User (global) | Always active | Yes (permissions) | Zero |
