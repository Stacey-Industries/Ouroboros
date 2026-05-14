---
status: OPEN
created: 2026-05-14
updated: 2026-05-14
---

# `[trace:agent-record]` / `[trace:ctx-preview]` logging floods the dev console

## Symptom

The dev-mode console / terminal is unreadable — two trace families fire dozens of times within a couple seconds, on every rule-file load and every `useMemo` recompute:

- `[trace:agent-record]` — variants `lookup`, `instructions_loaded reaching dispatcher`, `write-rules`
- `[trace:ctx-preview]` — variant `subscription fired`

Surfaced 2026-05-14 during Wave 88 manual smoke (the noise made the WebGL/dock smoke logs hard to read).

## Call sites (4, across 3 files)

| File | Site | Trace tag | Trigger |
|---|---|---|---|
| `src/main/hooksDispatchLogic.ts:38` | `traceInstructionsLoaded()` | `instructions_loaded reaching dispatcher` | Once per `instructions_loaded` hook-pipe event — i.e. once per rule file loaded at session bootstrap (~20+ in a startup burst) |
| `src/renderer/hooks/useAgentEvents.ruleSkillDispatchers.ts:96` | inside `dispatchRuleLoaded()` | `write-rules` | Same trigger — once per rule file. Fires *before* the Wave 82 `queueMicrotask` batch coalescer, so batching does not suppress it |
| `src/renderer/components/AgentChat/ComposerContextPreview.tsx:86` (approx) | `useActiveSessionRulesAndSkills` useMemo | `lookup` | Memo deps `[agents, claudeSessionId, filesystemRules, projectRoot]`; `agents` updates on every `RULES_BATCH_LOADED` / `TOKEN_UPDATE` / `AGENT_END` — recomputes dozens of times/min during active chat |
| `src/renderer/components/AgentChat/ComposerContextPreview.tsx:100-101` | same useMemo | `subscription fired` | Same as above — this is the dominant flood source |

All four use `log.info` from `electron-log`. No `console.*`, no debug gating. (`ContextPreview.popover.tsx` was named in the original grep but the live call sites are in `ComposerContextPreview.tsx`.)

## Why it is NOT safe to just delete

These are **live diagnostic instrumentation for two still-open bugs.** Per `roadmap/follow-ups/2026-05-11-chat-state-architecture-overhaul.md` (status: OPEN, priority: high), lines 68-69:

> "The Phase A `[trace:agent-record]` instrumentation — still in place; useful for the discovery work."
> "All `[trace:*]` instrumentation should be kept in place during the discovery; Phase Z's retain-vs-remove decision is deferred to after the overhaul plan."

The bugs they serve — `2026-05-11-context-preview-rules-evicted-after-time.md` and `2026-05-07-context-preview-rules-disappear-after-chat-start.md` — are both still OPEN. Deleting the traces would blind those investigations.

## Recommended fix — lower to `log.debug` (option C)

- **Not delete** — the overhaul follow-up explicitly says keep them through discovery.
- **Not a debug flag** — no existing renderer debug-flag pattern in the codebase; adding one is a larger net-new mechanism than warranted.
- **Lower `log.info` → `log.debug`** at all four sites. `electron-log`'s renderer console transport defaults to `info`, so `debug` lines are silently dropped unless someone investigating the eviction bug sets `log.transports.console.level = 'debug'` for their session. Readable console by default, zero diagnostic loss. Consistent with `~/.claude/rules/debug-before-fix.md`: "Gate verbose debug lines behind a flag or log level."

### Shape of the change

3 files, 4 mechanical one-line edits (`log.info` → `log.debug`), no import changes, no logic changes, no behavioral effect:
- `src/main/hooksDispatchLogic.ts` — 1 edit (~line 38)
- `src/renderer/components/AgentChat/ComposerContextPreview.tsx` — 2-3 edits (~lines 86, 100, 101)
- `src/renderer/hooks/useAgentEvents.ruleSkillDispatchers.ts` — 1 edit (~line 96)

Suitable for a `haiku-implementer` dispatch with the exact locations specified. No test coverage needed (log-level change, no behavior change).

## Not Wave 88 scope

This belongs to the chat-orchestration / context-preview subsystem and its open follow-up cluster — filed here for triage, not folded into Wave 88.
