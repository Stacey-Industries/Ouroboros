# Custom subagents emit zero thinking blocks; built-ins seemingly didn't

**Status:** OPEN — investigation incomplete, root cause not confirmed
**Filed:** 2026-04-27
**Affects:** Custom agent catalog at `~/.claude/agents/*.md` (13 agents)
**Severity:** High — agents grind in lint loops, drop final commit step, return mid-sentence summaries

---

## Symptom

Wave 59 was dispatched as four parallel subagent tracks. All four returned with truncated final messages and **none of the three implementer agents actually committed their work** despite being instructed to. The Sonnet implementer for Phase F (Track 3) did not even complete its main objective (wiring `ContextPreview` into `AgentChatComposer.tsx`).

Track-by-track turn counts (from `~/.claude/usage.jsonl`):

| Track | Agent | Model | Turns | Output | thinkingTurns | thinkingBlocks |
|---|---|---|---:|---:|---:|---:|
| 1 (A→B→D) | sonnet-implementer | sonnet-4.6 | — | — | 0 | 0 |
| 2 (Phase C) | sonnet-implementer | sonnet-4.6 | 40 | 16,570 | **0** | **0** |
| 3 (Phase F) | sonnet-implementer | sonnet-4.6 | 62 | 14,804 | **0** | **0** |
| 4 (Phase H) | haiku-implementer | haiku-4.5 | 33 | 3,740 | **0** | **0** |
| (parent) | this session | opus-4.7 | 54 | 83,048 | **16** | **16** |

The parent (Opus 4.7) produces 14–16 thinking turns per Stop event. **Every single subagent run in this user's history shows 0 thinking turns**, regardless of model, regardless of session.

Reviewing the full `~/.claude/usage.jsonl` (31 records, all from 2026-04-27): every `SubagentStop` record across multiple sessions and multiple agent types (`sonnet-implementer`, `sonnet-explorer`, `haiku-implementer`) has `thinkingTurns: 0` and `thinkingBlocks: 0`. The user reports having "spent hours earlier with another agent" believing they had fixed this — the data shows no fix has ever taken effect.

## User's challenge to the working theory

User pointed out: **"the built-in agents never did this."** Built-ins (`general-purpose`, `Explore`, `Plan`) historically worked without these symptoms. If the root cause is "Sonnet 4.6 needs explicit `effort` to emit thinking," built-ins on the same model would also fail — they didn't. So the working theory is incomplete.

This is the open question. Two possibilities:

1. **Built-ins have a config the customs don't.** Possibly `model: inherit` (which makes the agent run as parent — Opus 4.7 — with thinking inherited), or an implicit `effort` setting, or an env var the harness sets when spawning built-ins but not customs.
2. **Built-ins also had zero thinking and the user's perception of them "working" is based on outcomes (commits landing) not the metric.** Past tasks may have been smaller-scope, less lint-trapped, or completed before hitting the same failure mode.

The catalog enforcement hook (`~/.claude/hooks/agent_catalog_enforce.mjs`) blocks `general-purpose`, `Explore`, `Plan`, and bare `code-reviewer`. The user has not run a built-in in any session captured in `~/.claude/usage.jsonl`, so there is no apples-to-apples telemetry comparison available.

## Investigation done so far

- ✅ Confirmed `~/.claude/usage.jsonl` is correctly scanning transcripts for `block.type === 'thinking'` and `'redacted_thinking'` (the hook is at `~/.claude/hooks/log_usage.mjs:60-78` and the scan logic is correct).
- ✅ Confirmed no `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING` env var set in the active shell.
- ✅ Confirmed no `thinking` field in any of the 13 custom agent definitions at `~/.claude/agents/*.md`.
- ✅ Confirmed no `effort` field in any custom agent definition.
- ✅ Confirmed no thinking-related setting in `~/.claude/settings.json` or project `.claude/settings.json`.
- ✅ Web research (via `haiku-research-extractor`) confirmed: per Anthropic API docs, Sonnet 4.6 does not emit thinking blocks unless `thinking: { type: "adaptive" }` or `enabled` is explicitly passed in the API call. Subagent frontmatter schema documented as supporting `name`, `description`, `model`, `color`, `tools`, `effort` — open GitHub issue #31536 requests `effortLevel` in subagent frontmatter, suggesting `effort` support is recent or incomplete.
- ✅ Confirmed plugin agents in the cache (`~/.claude/plugins/cache/...`) use a mix: some `model: sonnet`, some `model: opus`, some `model: inherit`. The `superpowers:code-reviewer` uses `model: inherit`.
- ❌ **NOT confirmed:** what the built-in agents (`general-purpose`, `Explore`, `Plan`) actually look like — they're embedded in the Claude Code binary at `/c/Users/coles/.local/bin/claude.exe` (254MB packed exe) and `strings` doesn't surface them. Investigating the VS Code/Windsurf extension copies (`.windsurf-next/extensions/anthropic.claude-code-2.1.66-universal/resources/claude-code/`) might reveal a `cli.js` containing the bundled definitions — investigation interrupted before completion.
- ❌ **NOT tested:** whether adding `effort: high` to a custom agent definition actually produces non-zero `thinkingTurns` in a follow-up dispatch. This is the most direct experiment available.

## Hypotheses, ranked

1. **Custom agents need `model: inherit` to inherit the parent's adaptive-thinking config.** Specifying `model: sonnet` (or `model: haiku`) explicitly forces a downgrade to a model context where adaptive thinking is not auto-activated, and there is no per-agent thinking config field exposed. Built-ins may use `inherit` internally, which would explain the asymmetry. **Test:** create a copy of `sonnet-implementer.md` with `model: inherit` and dispatch a small task; check `usage.jsonl` for thinking blocks.

2. **`effort: high` in agent frontmatter activates adaptive thinking on Sonnet/Haiku subagents.** Per docs research, `effort` is the lever for adaptive thinking on these models. **Test:** add `effort: high` to one custom agent and dispatch.

3. **Subagent thinking config is set by an env var the parent passes through `Agent` tool spawn, and that pathway is broken or not invoked for custom agents.** Would require reading the Claude Code spawn code (in `cli.js` or equivalent).

4. **The thinking metric itself is misleading.** Maybe the agents *are* thinking, but in summarized/omitted form that the hook doesn't count. Counter-evidence: parent (Opus 4.7) produces visible thinking blocks in the same hook scan, so the scan logic isn't the issue.

## Concrete next steps for the next session

1. **Find the built-in agent definitions.** Try:
   - `find /c/Users/coles/.windsurf-next/extensions/anthropic.claude-code-2.1.66-universal/resources/claude-code/ -name "*.js" -exec grep -l "general-purpose" {} \;`
   - Or extract from the exe: `cd /tmp && cp /c/Users/coles/.local/bin/claude.exe . && 7z x claude.exe` (if Electron-packed)
   - Or check `npm view @anthropic-ai/claude-code` if it's a published package — the bundled agent specs may be in there.
2. **Compare model field and any other frontmatter** between built-ins and the user's customs.
3. **Test hypothesis 1** — copy `sonnet-implementer.md` to `sonnet-implementer-inherit.md`, change `model: sonnet` to `model: inherit`, dispatch a small test task, check `usage.jsonl` for `thinkingTurns > 0`.
4. **Test hypothesis 2** — add `effort: high` to the same test agent, re-dispatch.
5. **If neither works:** file a Claude Code GitHub issue with the telemetry data above (`thinkingTurns: 0` across all subagent types, all sessions). Reference issue #31536.
6. **Workaround until fixed:** dispatch implementer subagents with smaller per-task scope (one phase, one file at a time), with explicit "if you hit a lint failure twice, stop and report" escape hatches in the prompt. Or do implementer work in parent (Opus 4.7) and use subagents only for read-only research/exploration.

## Files referenced

- `~/.claude/agents/*.md` — 13 custom agent definitions, all use `model: sonnet` or `model: haiku` (no `inherit`, no `effort`)
- `~/.claude/hooks/log_usage.mjs` — telemetry hook; correctly scans for thinking blocks
- `~/.claude/usage.jsonl` — telemetry log; 31 records as of 2026-04-27, every subagent record shows zero thinking
- `~/.claude/hooks/agent_catalog_enforce.mjs` — denies built-in agent dispatch; blocks the experiment of running a built-in for comparison
- `~/.claude/rules/agent-catalog.md` — documents the catalog routing rule
- `~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/agents/code-reviewer.md` — example of `model: inherit` in a plugin agent

## Wave 59 fallout (operational, not part of root cause)

The current wave is partially landed:
- Phase A committed (`3b2b042`)
- Phase B committed (`dd30bc0`)
- Phase D incomplete — only `InnerSidebarChats.tsx` exists, no Terminals/Code, no commit
- Phase C: files written, not committed; agent also touched `ChatOnlyTitleBar.tsx` against scope
- Phase F: files exist; `AgentChatComposer.tsx` was NOT wired (the main goal of the phase)
- Phase H: verified, files modified, not committed
- Phase I: not started

The remaining work needs to land via either parent-finish (Opus 4.7 has thinking, won't lint-loop) or via re-dispatch *after* the subagent thinking issue is resolved. Recommend parent-finish for this wave to unblock; treat the subagent issue as a separate investigation tracked here.
