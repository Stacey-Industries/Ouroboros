---
status: IN-PROGRESS
created: 2026-05-11
updated: 2026-05-11
profile: A
stage: 1-discovery
---

# Chat Orchestration — Discovery Initiative

Replaces piecemeal chat-lifecycle bug-fix waves with a mapped overhaul. Source framing: `roadmap/follow-ups/2026-05-11-chat-state-architecture-overhaul.md`.

## Goal

MAP the chat state architecture before any overhaul work. The map drives the design, not the reverse.

## Constraint that differentiates this IDE from typical chat-with-agent products

This IDE uses **Claude Code CLI subprocesses with subscription auth (Claude Max), NOT direct API or Agent SDK access.** The differences are load-bearing:

- No direct control over streaming server — bytes come from `claude` CLI stdout (stream-json mode).
- Session identity is the CLI's `--resume` UUID, not an internally-issued conversation ID.
- Multiple session-ID namespaces in flight (hook pipe UUID, stream-json UUID, internal thread UUID).
- Hook system (named-pipe events on lifecycle transitions) substitutes for some SDK callbacks but not all.
- `countTokens`, prompt caching control, structured multi-turn input, and message-history retrieval are NOT available.

These differences must be cleanly understood, mapped, and documented before applying patterns from API-direct IDE products.

## Folder contents (target shape — Profile A 10-doc set)

| File | Status | Purpose |
|---|---|---|
| `00-prep-codebase-manifest.md` | pending | Reading-list manifest by axis + instrumentation inventory (Agent 1 output) |
| `01-research-claude-code-cli-headless.md` | pending | Subscription CLI capabilities deep-dive (Agent 2 output) |
| `02-research-ide-chat-patterns.md` | pending | IDE-with-agent product survey (Agent 3 output) |
| `03-research-streaming-state-architecture.md` | pending | Streaming/state architecture spectrum (Agent 4 output) |
| `04-state-map.md` | pending | The MAP itself — produced from prep + research via brainstorming |
| `05-identity-model.md` | pending | UUID taxonomy and conflation points |
| `06-event-flow.md` | pending | Every event source → reducer with ordering guarantees |
| `07-lifecycle.md` | pending | Chat-start to teardown transitions |
| `08-boundary-leaks.md` | pending | State desync paths, suppression bypasses |
| `09-persistence-inventory.md` | pending | What's stored where, what should/shouldn't be |

## Out of scope (per follow-up doc)

- Mention types (@url, @web, @thread, @diff/@commit) — feature additions, not state fixes.
- System prompt visibility — UX feature.
- Per-hunk accept/reject in diff review — separate wave.
- `AgentChatConversation.tsx` line-count refactor — unrelated tech debt.
