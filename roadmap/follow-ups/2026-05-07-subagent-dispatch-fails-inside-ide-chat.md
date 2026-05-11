---
status: OPEN
created: 2026-05-07
updated: 2026-05-07
---

# Subagent dispatch (sonnet-implementer) fails mid-turn when invoked from IDE chat

## Symptom

The IDE's chat agent dispatched a `sonnet-implementer` subagent via the Agent tool. The dispatch errored mid-turn — the parent agent's turn was stopped while the subagent was still executing (or possibly during dispatch handshake; needs the error text to disambiguate).

The same dispatch shape works fine when invoked from a vanilla Claude Code CLI session run from a terminal. So this is specifically an IDE-orchestration-path defect, not an Agent SDK or harness bug.

## Repro

1. Open the IDE, start a chat.
2. Ask the chat agent to do something that causes it to dispatch via the Agent tool with `subagent_type: "sonnet-implementer"`.
3. Observe: the parent's turn errors mid-stream and stops. The error string is the **critical missing detail** for B1 — capture it on the next reproduction.
4. Run the same prompt against `claude` from a terminal in the same project — the dispatch works cleanly.

## Error text (captured 2026-05-07)

```
Agent stopped — Claude Code reported an error
API Error: Internal server error
```

Context around the failure: parent agent had just committed Phase 0 (commit `7522310`) and was dispatching Phase 1 (`provider-aware env fallback (M15 + L4 F3)`) to `sonnet-implementer`. The error fired during dispatch.

**This is a 500 from the API, not a tool-resolution / MCP / transport error.** That meaningfully reshapes the hypothesis space — the request reached Anthropic's servers; the server rejected it.

## Still to capture on next repro

- IDE devtools console output at the moment of the error (Help → Toggle Developer Tools).
- Orchestration log entries — see `src/main/orchestration/providers/claudeStreamJsonRunner.ts` and `claudeCodeSubagentHandler.ts`.
- The `session.jsonl` for the affected thread.
- The exact subagent dispatch request body (model, system prompt size, tool list size). A 500 sometimes correlates with payload shape.

## Suspect surface

The IDE-CLI-vs-terminal-CLI difference points at orchestration's process-management layer, not at Claude Code itself.

- `src/main/orchestration/providers/claudeStreamJsonRunner.ts` — primary `--print --output-format stream-json` runner. Subagent invocations come through here (not a separate CLI process).
- `src/main/orchestration/providers/claudeCodeSubagentHandler.ts` — subagent-event handler; specifically named for this surface.
- `src/main/orchestration/providers/claudeWarmStreamJsonRunner.ts` — warm-runner variant; if the bug is specific to warm dispatch, the warm/cold split is suspect.
- `src/main/orchestration/providers/scopedMcpConfig.ts` — the IDE injects an MCP config (codemode proxy + ouroboros) that the terminal CLI doesn't carry. If a tool the subagent expects is shadowed/missing inside the IDE's MCP scope, the subagent's stream-json could error.
- `src/main/agentChat/chatOrchestrationBridge.ts` — bridge that translates orchestration events to chat UI events; could surface a transport error as a stream stop.

## Likely failure modes (revised after error text in hand)

The error is `API Error: Internal server error` — a 500 from Anthropic's API. The request reached the server. This rules out tool-shadowing, stdout-backpressure, and most local-process-management hypotheses.

**OAuth threading is NOT the cause.** Verified empirically: Cole has multiple concurrent IDE sessions running on the OAuth/Max-subscription path right now without issue. The auth handshake works; something about *this specific dispatch's request shape* doesn't.

Revised candidates (auth handshake removed):

1. **Payload-shape difference on IDE-dispatched subagents.** The IDE may inject additional content (per-window project context, scoped MCP server descriptions, codemode proxy bootstrap, expanded tool list) that the terminal CLI doesn't. If the cumulative payload exceeds a server-side limit or hits a malformed-shape edge case (e.g., codemode-proxy MCP server descriptors with shapes the API didn't intend), 500 is the typical symptom. **Highest-prior hypothesis** — the IDE-vs-terminal asymmetry has to live somewhere in request body, and tool/MCP injection is the largest delta.
2. **Subagent system prompt collision with caller-provided prompt template.** The catalog agent (`sonnet-implementer`) brings its own system prompt; the IDE may additionally prepend its own per-window project block. Doubled / contradictory system prompt content at certain shapes has caused 500s historically.
3. **Tool-list size or shape.** Subagents inherit a tool list. If the IDE assembles a larger or more-deeply-nested tool list than the terminal (codemode proxy + scoped MCP + builtins), and one descriptor has a shape the API rejects, 500 results. The subagent's `tools:` frontmatter (e.g. `Read, Edit, Write` for haiku-implementer) should constrain this — but only if the dispatch path honors it.
4. **Transient API hiccup.** Genuine Anthropic-side 500 unrelated to the IDE. Falsifiable: re-run the same dispatch from terminal at roughly the same time. If terminal succeeds, IDE-specific. The user already eyeballed this — IDE fails, terminal works — so this is unlikely but worth recording.
5. **Subagent-truncation #54018 (already-known).** Async subagent loops silently truncated upstream. This bug errors loudly rather than silently truncating — different shape. Cross off unless the dispatch was async.

## Investigation plan (when picked up)

Per `~/.claude/rules/debug-before-fix.md` + `multi-process-debugging.md`:

1. **First, capture the error text from a fresh repro** (see "What we don't have yet" above). Without that, instrumentation is shooting in the dark.
2. Compare the spawn args: `log.info('[trace:subagent] spawn', { argv, env: filteredKeys, cwd })` at the runner's spawn site for both IDE and terminal paths (the terminal path being a manual one-off for comparison).
3. Compare stream-json transcripts: capture the parent's full stream-json output up to and including the error frame. The error frame's structure (what's `tool_use`, what's `result`, what's `error`) tells whether the failure is in dispatch handshake, subagent-side execution, or transport.
4. Compare MCP servers visible to the subagent: `claudeCodeSubagentHandler` likely sets a scoped MCP config; log it.
5. Only after 1-4, propose hypotheses to pin down further.

## Priority

Medium-high — IDE-specific orchestration regression, blocks subagent dispatch from chat (a flagship feature). Workaround exists (run from terminal). Not in Wave 84.

## Related

- Memory entry: `subagent-truncation investigation (#54018)` — async subagent loops silently truncated. Different shape (this one errors loudly mid-turn rather than silently truncating), but adjacent.
- Memory entry: chat agent must have full IDE control (terminals, files, UI) — this regression undercuts that goal.
- Adjacent open follow-ups (chat-only-shell post-chat-start state bugs): `2026-05-07-context-preview-rules-disappear-after-chat-start.md`, `2026-05-07-full-review-artifact-pane-empty.md`, `2026-05-07-chat-streaming-freezes-on-project-switch.md`, `2026-05-07-queued-message-no-autosend-and-text-reappears.md`.
