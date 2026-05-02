# Cross-window IDE-tool delegation (Option 2)

**Status:** DEFERRED — preserved for future maintainers / post-OSS users
**Source:** Wave 42 → 43 → 44 → 45+ deferral chain; `roadmap/audit-verification-pass.md` Section D item #9
**Filed:** 2026-05-01

## Why this lives in `deferred/` not `future/`

This item has been deferred for four consecutive waves on the premise *"only if dogfooding surfaces the need."* For the current single-developer use case, that premise still holds — the original developer hasn't hit the limitation in practice and isn't committing to a wave for it.

It's preserved here because in a multi-user scenario (post-sale, post-open-source, or post-team-onboarding) the gap likely matters. Users who run multiple IDE windows or pair a chat-only shell with an IDE window will eventually notice that the agent is blind to the "other" window's state.

## What's missing

The IDE exposes live-state tools to running agents — `getOpenFiles`, `getActiveFile`, `getSelection`, `getUnsavedContent`, `getTerminalOutput` — wired through `src/main/ideToolServer.ts`. They work in a single-window setup. They do not work across windows.

In a multi-window setup:

- **Window A** has the project open, file `foo.ts` active, terminal A scrolled.
- **Window B** is a chat-only shell. Agent in B calls `getActiveFile` → returns nothing. Agent has no visibility into window A's state.
- **Window B** is a second IDE window on a different project. Agent in B calls `getOpenFiles` → returns only B's files, not A's.

The chat-only shell doesn't even mount `IdeToolBridge` (Wave 42 deliberate choice — *"matches Claude desktop. Document as intentional."*).

## Why it's not trivial — design decisions to make first

The wiring isn't the hard part. The semantic is:

| Decision | Possible answers |
|---|---|
| Which window's state does `getActiveFile` return when called from a chat-only shell? | (a) Last-focused IDE window. (b) Explicit window-pairing — chat shell pairs to one IDE window on launch. (c) Aggregate across all windows. (d) Required `windowId` parameter. |
| What about a second IDE window on a different project? | (a) Each window's tools see only its own state (current behavior). (b) Tools accept a `windowId`. (c) Tools return arrays grouped by window. |
| `getOpenFiles` aggregation cost | Single tool call → N IPC roundtrips → aggregation logic. Acceptable up to ~5 windows; degrades past that. |
| Empty results from chat-only with no paired IDE | Auto-pair on first tool call? Return empty? Surface an error to the agent? |

Wrong design here is reversible but expensive (agents that learn one shape will need to relearn).

## Suggested wave shape (when this gets activated)

**Pre-wave: 30-minute design spike.** Pick a model based on real usage data. Two reasonable starting points:

- **Option A — Window pairing.** Each chat-only shell is paired with one IDE window (the most-recently-focused at chat-shell launch, or explicit selection). All IDE-tool calls auto-route to that pair. Multi-IDE-window users still get per-window isolation.
- **Option B — Explicit window context.** IDE-tools accept an optional `windowId` parameter. Default is the calling window's own state. Agent that wants cross-window access asks explicitly. Less magic, more verbose.

**Phase A:** Mount `IdeToolBridge` in `ChatOnlyShell` with the chosen pairing/routing model. Wire window enumeration in `ideToolServer.ts` so handlers can resolve `windowId` → `webContents`.

**Phase B:** Update the IDE-tool schema (in `src/main/ideToolServer*.ts` and the agent-facing tool definitions) to reflect the new contract. Document the cross-window semantics in `docs/api-contract.md`.

**Phase C:** Smoke test with a real two-window setup. Confirm tool calls return the expected window's state.

## What changes in the user's mental model

Currently: "the agent in this window sees this window's state." Simple.

After: "the agent in this window sees [whatever the routing rule says]." This needs to be discoverable in the UI — likely a small indicator in the chat composer: *"Linked to window: Agent IDE (foo.ts)"* — so users know what the agent can see.

Skipping that UI affordance is a common mistake; without it, agents start "lying" (returning state from a window the user isn't looking at) and trust erodes.

## Deferral history

| Wave | Disposition | Reason |
|---|---|---|
| Wave 42 | Out-of-scope | "this IDE is agent-first with minimal direct user editing" |
| Wave 43 | Wave 44+ candidate | "deferred from Wave 42" |
| Wave 44 | Wave 45+ candidate | "still deferred" |
| Wave 45+ | Open | Never picked up |

## Trigger conditions to revisit

Move this from `deferred/` to `future/` (or commit to a wave directly) if any of these become true:

- The IDE is being used by more than one person regularly
- A chat-only mobile build (Capacitor) ships, where users will likely pair a desktop IDE with a mobile chat
- A user file complaint or telemetry signal indicates the gap is hurting agent quality
- An open-source / SaaS distribution starts where multi-window is the norm

## References

- `src/main/ideToolServer.ts` — current IDE-tool server (single-window)
- `src/renderer/components/Layout/ChatOnlyShell/` — where `IdeToolBridge` is *not* currently mounted
- `src/main/windowManager.ts` — per-window project root + state isolation
- `roadmap/archive/wave-42-plan.md:35,318` — original deferral
- `roadmap/archive/wave-43-plan.md:457` — re-deferred
- `roadmap/archive/wave-44-plan.md:55,343` — re-deferred again
- Audit: `roadmap/audit-verification-pass.md` Section D item #9
