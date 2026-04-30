<!-- claude-md-auto:start -->

<!-- claude-md-auto:end -->

<!-- claude-md-manual:preserved -->

# `src/main/rulesAndSkills/` — Claude Code Configuration I/O

CRUD and discovery layer for Claude Code's file-based configuration: `.claude/rules/*.md`, `.claude/commands/*.md`, hooks in `.claude/settings.json`, and root-level `CLAUDE.md`/`AGENTS.md`.

## File Map

| File                       | Role                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `rulesDirectoryManager.ts` | CRUD for `.claude/rules/*.md` — global (`~/.claude/rules/`) and project (`{root}/.claude/rules/`)                     |
| `commandsManager.ts`       | CRUD for `.claude/commands/*.md` — same dual-scope pattern                                                            |
| `commandsDiscovery.ts`     | Scan + parse command files; extracts description from first non-blank line; prefixes scope as `user:*` or `project:*` |
| `hooksManager.ts`          | Read/write hooks inside `.claude/settings.json` — addHook / removeHook by event type + index                          |
| `settingsManager.ts`       | Generic key-level read/write for `.claude/settings.json` (global) or `.claude/settings.local.json` (project)          |
| `rulesReader.ts`           | Read `CLAUDE.md` / `AGENTS.md` from a project root; provider-aware (`codex` → `AGENTS.md`)                            |
| `rulesWatcher.ts`          | chokidar watcher for all of the above; 1 s debounce; returns a stop function                                          |
| `index.ts`                 | Barrel re-export — all public functions                                                                               |

## Scope Convention

Every operation accepts `scope: 'global' | 'project'` + optional `projectRoot`:

| Scope     | Rules dir               | Commands dir               | Settings file                        |
| --------- | ----------------------- | -------------------------- | ------------------------------------ |
| `global`  | `~/.claude/rules/`      | `~/.claude/commands/`      | `~/.claude/settings.json`            |
| `project` | `{root}/.claude/rules/` | `{root}/.claude/commands/` | `{root}/.claude/settings.local.json` |

Passing `scope: 'project'` without `projectRoot` throws — callers must supply it.

## Key Behaviours

- **Name sanitization**: `rulesDirectoryManager` and `commandsManager` strip non-`[a-zA-Z0-9_-]` characters from filenames via `path.basename(name).replace(...)`. Names are never passed raw to the filesystem.
- **Description extraction**: Both rules and commands auto-derive a description from the first non-blank line of the file, capped at 80 chars. No frontmatter.
- **Rules content truncation**: `rulesReader.ts` caps `CLAUDE.md` / `AGENTS.md` content at **12 KB** and appends a truncation note — prevents oversized files from flooding agent context.
- **Hooks are index-based**: `removeHook` splices by position within a `ClaudeHookMatcher[]` array for a given `eventType`. There is no hook ID — callers must read the current list first.
- **settingsManager vs hooksManager**: `settingsManager` operates on arbitrary top-level keys. `hooksManager` is a typed specialisation that merges into the `hooks` sub-key specifically. Don't mix them for hooks.
- **Watcher scope**: `rulesWatcher.ts` watches both project and global `.claude/commands/` and `.claude/rules/` dirs, plus the root `CLAUDE.md`/`AGENTS.md`. It uses `persistent: false` so it won't keep the process alive alone.

## Gotchas

- **Wave 62 ephemeral toggles — restore must fire AFTER Claude Code ingests rules, not before.** `disableRule` moves a file to `<rules-root>-disabled/`; `restoreAllDisabled` moves everything back. The post-spawn restore in `postSpawnRestore.ts` is gated on the first `system { subtype: 'init' }` event from the stream-json runner — that's the canonical signal the system prompt has been built. Calling restore earlier (e.g. at PTY-spawn time) would race Claude Code reading rules from disk and silently re-enable a "disabled" rule for the spawning session. Reason: Claude Code has no `--rules-dir` flag and no runtime filter; on-disk state at the moment of system-prompt construction is the only lever.

## Dependencies

- Types from `@shared/types/claudeConfig` (`ClaudeConfigScope`, `RuleDefinition`, `CommandDefinition`) and `@shared/types/rulesAndSkills` (`HooksConfig`, `ClaudeHookMatcher`, `RulesFile`).
- `chokidar` — watcher only (`rulesWatcher.ts`).
- No IPC here — consumed by `src/main/ipc-handlers/` which wraps these functions and exposes them to the renderer.
