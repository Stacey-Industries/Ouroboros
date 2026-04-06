<!-- claude-md-auto:start -->
`★ Insight ─────────────────────────────────────`
A few things worth noting about this module's design:

- **Dual-scope pattern is the load-bearing abstraction** — every public function accepts `ClaudeConfigScope + projectRoot?`. This mirrors exactly how Claude Code itself resolves configuration (global wins unless project overrides). The module is essentially an SDK over Claude Code's own config conventions.
- **`settingsManager` vs `hooksManager` split** — `settingsManager` is generic (any key), `hooksManager` is a typed specialisation for the `hooks` sub-object. Using `settingsManager` for hooks would work mechanically but would bypass the `ClaudeHookMatcher` type enforcement and the matcher-merging logic.
- **12 KB truncation in `rulesReader.ts`** is a context-budget guardrail. Large `CLAUDE.md` files silently get cut before being injected into agent prompts — important to know when debugging "why didn't the agent see my rule".
`─────────────────────────────────────────────────`

The CLAUDE.md is written. It covers the scope convention table, per-file roles, the five non-obvious behaviours (name sanitization, description extraction, 12 KB truncation, index-based hook removal, the settingsManager/hooksManager boundary), and the watcher's `persistent: false` flag.
<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->
# `src/main/rulesAndSkills/` — Claude Code Configuration I/O

CRUD and discovery layer for Claude Code's file-based configuration: `.claude/rules/*.md`, `.claude/commands/*.md`, hooks in `.claude/settings.json`, and root-level `CLAUDE.md`/`AGENTS.md`.

## File Map

| File | Role |
|------|------|
| `rulesDirectoryManager.ts` | CRUD for `.claude/rules/*.md` — global (`~/.claude/rules/`) and project (`{root}/.claude/rules/`) |
| `commandsManager.ts` | CRUD for `.claude/commands/*.md` — same dual-scope pattern |
| `commandsDiscovery.ts` | Scan + parse command files; extracts description from first non-blank line; prefixes scope as `user:*` or `project:*` |
| `hooksManager.ts` | Read/write hooks inside `.claude/settings.json` — addHook / removeHook by event type + index |
| `settingsManager.ts` | Generic key-level read/write for `.claude/settings.json` (global) or `.claude/settings.local.json` (project) |
| `rulesReader.ts` | Read `CLAUDE.md` / `AGENTS.md` from a project root; provider-aware (`codex` → `AGENTS.md`) |
| `rulesWatcher.ts` | chokidar watcher for all of the above; 1 s debounce; returns a stop function |
| `index.ts` | Barrel re-export — all public functions |

## Scope Convention

Every operation accepts `scope: 'global' | 'project'` + optional `projectRoot`:

| Scope | Rules dir | Commands dir | Settings file |
|-------|-----------|--------------|---------------|
| `global` | `~/.claude/rules/` | `~/.claude/commands/` | `~/.claude/settings.json` |
| `project` | `{root}/.claude/rules/` | `{root}/.claude/commands/` | `{root}/.claude/settings.local.json` |

Passing `scope: 'project'` without `projectRoot` throws — callers must supply it.

## Key Behaviours

- **Name sanitization**: `rulesDirectoryManager` and `commandsManager` strip non-`[a-zA-Z0-9_-]` characters from filenames via `path.basename(name).replace(...)`. Names are never passed raw to the filesystem.
- **Description extraction**: Both rules and commands auto-derive a description from the first non-blank line of the file, capped at 80 chars. No frontmatter.
- **Rules content truncation**: `rulesReader.ts` caps `CLAUDE.md` / `AGENTS.md` content at **12 KB** and appends a truncation note — prevents oversized files from flooding agent context.
- **Hooks are index-based**: `removeHook` splices by position within a `ClaudeHookMatcher[]` array for a given `eventType`. There is no hook ID — callers must read the current list first.
- **settingsManager vs hooksManager**: `settingsManager` operates on arbitrary top-level keys. `hooksManager` is a typed specialisation that merges into the `hooks` sub-key specifically. Don't mix them for hooks.
- **Watcher scope**: `rulesWatcher.ts` watches both project and global `.claude/commands/` and `.claude/rules/` dirs, plus the root `CLAUDE.md`/`AGENTS.md`. It uses `persistent: false` so it won't keep the process alive alone.

## Dependencies

- Types from `@shared/types/claudeConfig` (`ClaudeConfigScope`, `RuleDefinition`, `CommandDefinition`) and `@shared/types/rulesAndSkills` (`HooksConfig`, `ClaudeHookMatcher`, `RulesFile`).
- `chokidar` — watcher only (`rulesWatcher.ts`).
- No IPC here — consumed by `src/main/ipc-handlers/` which wraps these functions and exposes them to the renderer.
