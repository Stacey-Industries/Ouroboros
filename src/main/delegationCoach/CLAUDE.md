# `src/main/delegationCoach/` — Delegation Coach (Wave 61)

Pattern-matched nudges that fire when Opus is mid-session and about to do something the catalog at `~/.claude/agents/` would handle better. The coach runs as a Claude Code hook (`~/.claude/hooks/delegation_coach.mjs`) chained after `pre_tool_use.mjs` and `agent_catalog_enforce.mjs`. This directory holds the pure-data pattern library and the matcher; the hook is glue.

## File map

| File             | Role                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `types.ts`       | Shared types: `ToolCallEvent`, `PatternDefinition`, `PatternMatch`, trigger DSL.                                                                       |
| `patterns.ts`    | The seed library. Hand-curated, JSON-serializable. `SEED_PATTERNS` is the canonical list; `activePatterns()` filters out `enabled:false` entries.      |
| `detector.ts`    | Pure matcher. `detectPatterns(history, current, patterns, opts)` returns matches. `globMatches` is exported for tests; `pruneHistory` is for the hook. |
| `coachLogger.ts` | (Phase B) JSONL writer at `{userData}/delegation-coach.jsonl`.                                                                                         |

## Trigger DSL

Patterns are pure data so the build step can emit them as `out/coach-patterns.json` for the hook. The DSL has three primitives:

- **`current` matcher** — constraint on the call about to fire (tool name, file path glob, optional path negation).
- **`history` requirements** — list of constraints, each counting matches in a `withinMs` window with `min`/`max` bounds.
- **`cooldownMs`** — caller-tracked suppression so the same pattern doesn't fire on every tool call once its conditions hold.

A pattern fires when `current` matches AND every `history` requirement is satisfied AND the pattern is not in cooldown.

## Glob semantics

Bash-like, intentionally minimal:

- Patterns without `/` match against the path's **basename** (so `*.test.*` matches `/repo/src/foo.test.ts`).
- Patterns with `/` match against the **full path**.
- `*` does not cross `/`; `**` does.
- All matches are case-insensitive (paths and patterns are lowercased).

The matcher is _not_ a full glob implementation. If a future pattern needs character classes or `?`, extend `globToRegexBody` in `detector.ts` and add tests for the new semantics.

## Phase F analytics recipe

After ≥1 week of soft-nudge data captured at `{userData}/delegation-coach.jsonl`:

1. Group entries by `patternId`.
2. Per pattern, compute:
   - **fire rate**: matches ÷ tool calls in the window.
   - **take rate**: matches followed by an `Agent` tool call within ~30s (Opus dispatched a subagent in response).
   - **success rate**: of taken nudges, fraction where the dispatched subagent's `SubagentStop` payload reports success.
3. Promotion candidates:
   - take rate < 30% over ≥50 fires → either promote to acknowledgment tier OR refine the suggestion text.
   - take rate > 70% AND success rate > 80% → soft tier is doing its job; leave as-is.
   - fire rate > 1 per 10 tool calls → likely too noisy; tighten the trigger.
4. Demotion candidates:
   - matches consistently followed by Opus continuing the un-delegated path AND the un-delegated path succeeded → pattern's nudge is wrong; disable.

## Gotchas

- **Pattern library duplication**: `SEED_PATTERNS` is the canonical source. The hook reads a build-emitted JSON copy at `~/.claude/hooks/lib/coach-patterns.json`. Never edit the JSON copy by hand — drift between repo and hook is a real failure mode. The build step (Phase C) is the source of truth.
- **Detector is stateless**: cooldown bookkeeping is the caller's job. The hook holds it across invocations; tests pass an explicit `lastFiredAt` map. Don't add module-level state here.
- **History must be bounded by the caller**: `pruneHistory` is provided for this. Detector trusts the input not to grow.
- **Subagent self-disable lives in the hook, not here**: when the coach hook runs inside a subagent process, it must exit immediately. This module has no opinion on that — `detectPatterns` will happily match patterns regardless. The gate is in `delegation_coach.mjs`.
- **Tool names are case-sensitive**: matches Claude Code conventions (`Read`, not `read`).
- **`extractFilePath` accepts `file_path` OR `path`**: most Claude Code tools use `file_path`; a few use `path`. If a future tool uses a third key, extend the helper.

## Tech debt / deferred patterns

Patterns the simple trigger DSL can't express yet — listed in `patterns.ts` header comment for traceability:

- Repetitive edit (same Edit shape across N files) — needs argument fingerprinting.
- Failed-fix loop (3+ Edit attempts on same target) — needs same-target tracking.
- Library API research (Edit code with imports + no recent context7 lookup) — needs file-content inspection.
- Mass lint cleanup — needs lint context outside the tool stream.
- New module being designed (Write >100 lines, no prior architecture) — needs Write content size inspection.

Add these only when Phase F data shows a real delegation gap they would close, not preemptively.
