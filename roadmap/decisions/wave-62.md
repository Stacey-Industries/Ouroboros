# Wave 62 — ADR: Ephemeral Rule Toggles in Chat-Only Workbench

**Status:** LOCKED 2026-04-30 by orchestrator + user.
**Plan:** `roadmap/wave-62-rule-toggles.md`

---

## Decision 1: Disable mechanism — move to sibling directory

**Context:** Claude Code's harness auto-injects every `.md` file under `~/.claude/rules/` and `<project>/.claude/rules/` whose frontmatter glob matches the current request. There is no runtime filter, no `--rules-dir` flag, and no allow/deny list we can register. Three options for "disable" semantics:

- **(a) Rename extension** — `foo.md` → `foo.md.off` in the same directory.
- **(b) Move to sibling dir** — `<rules-root>/foo.md` → `<rules-root>-disabled/foo.md`.
- **(c) Manifest + staging dir** — keep an `.claude/rules-enabled.json` source of truth and stage enabled rules into a per-session temp dir before each spawn.

**Pick:** (b) — move to sibling dir.

**Rationale:** (a) pollutes `ls .claude/rules/` with mixed-extension entries and may break external tooling that keys on `*.md`. (c) requires Claude Code to honor an alternate rules directory, which it doesn't, and would mean filesystem trickery (symlinks/junctions on Windows are flaky). (b) is reversible with a single `fs.rename`, leaves both directories cleanly inspectable, and survives if the user hand-edits a disabled rule.

**Consequences:** A new sibling dir per scope: `~/.claude/rules-disabled/` and `<project>/.claude/rules-disabled/`. The project-scope dir must be gitignored. The watcher in `rulesWatcher.ts` will need to extend its glob to include the disabled sibling so the renderer sees state changes.

---

## Decision 2: Restore timing — post-spawn, not pre-spawn

**Context:** The user's stated UX: "each chat starts with the baseline rules on." Two restore-timing options:

- **(a) Pre-spawn** — restore disabled rules immediately before every new session spawns. Net effect: toggles are inert; disabling does nothing across the session boundary.
- **(b) Post-spawn** — restore right after a session's first spawn confirms the system prompt has been ingested. Net effect: a toggle takes effect for exactly one session, then resets.

**Pick:** (b) — post-spawn restore.

**Rationale:** (a) defeats the feature. The user wants ephemeral disabling that _applies to the upcoming session_, not retroactively. Once Claude Code has read the rules into its system prompt at spawn time, the on-disk state no longer affects the running session — `fs.rename` after that moment is invisible to the running process and primes the disk for a baseline-on next session.

**Consequences:** We need a reliable signal for "system prompt has been ingested." The cheapest correct proxy is the post-spawn confirmation event from `claudeStreamJsonRunner` — emitted after the runner has handed control to Claude Code. Resumed sessions (`--resume`) don't re-read rules from disk, so restore is a no-op for them. Concurrent windows: if window A toggles off rule X and window B spawns simultaneously, B's session also sees X disabled. Acceptable for v1; documented in the gotcha.

---

## Decision 3: Toggle state is filesystem-only — no config schema entry

**Context:** Where does "is rule X disabled right now?" live?

- **(a) New config schema field** — persistent map of disabled rule IDs.
- **(b) Filesystem only** — disabled iff a file exists in `<rules-root>-disabled/`.

**Pick:** (b) — filesystem only.

**Rationale:** The state is intrinsically ephemeral (Decision 2). Persisting it would create drift between config and disk: a config entry says "disabled" but the file is back in active dir, or vice versa. With filesystem as the source of truth, the answer is always one `existsSync` away and there's no migration surface.

**Consequences:** No `configSchema*.ts` change. Renderer reads disabled state via the same IPC list as active rules — handler walks both dirs and tags each entry with a `disabled` flag.

---

## Decision 4: UI lives on shared `RulesTab.tsx` only

**Context:** Both the chat-only workbench utility drawer and the IDE-mode right-sidebar Claude Config panel render rules through `src/renderer/components/AgentChat/RulesTab.tsx`. We could add the toggle to a single surface only, both, or a new dedicated panel.

**Pick:** Add to `RulesTab.tsx`. Both surfaces light up automatically.

**Rationale:** Single source of truth keeps the wave tight and avoids divergence. The user explicitly asked for the toggle in the chat-only popup; the IDE-mode mirror is a free win from the shared component.

**Consequences:** No Settings-modal section in v1. If a Settings mirror is ever wanted, it can wrap the same `<ToggleSwitch>` row component.

---

## Decision 5: Boot-time orphan-restore preserves baseline-on invariant

**Context:** If the app or a session crashes while rules are disabled, files are left in `<rules-root>-disabled/`. Without intervention, the next app launch would start with rules silently disabled — violating the user's "baseline on" expectation.

**Pick:** Restore all disabled rules during main-process startup, before any window opens.

**Rationale:** The invariant the user wants is _baseline at the start of every chat_. Boot is the wider net that catches the pathological case (crash) the post-spawn restore (Decision 2) misses.

**Consequences:** One additional call site (in `src/main/main.ts` or an init hook in `rulesAndSkills/`). Idempotent — restore is safe to run when the disabled dir is empty. Logged at `info` so we can see how often the orphan path fires (signal of crashes during disabled state).
