# Wave 25 — Research Pipeline (Explicit) & Pinned Context Primitive
## Implementation Plan

**Version target:** v1.7.1 (patch)
**Feature flag:** `research.explicit` (default `true`)
**Dependencies:** Wave 15 (telemetry), Wave 16 (session primitive)

---

## Phase breakdown

| Phase | Scope | Key files |
|-------|-------|-----------|
| A | Pinned context primitive — session field, store, IPC, `PinnedContextCard` UI | `pinnedContextStore.ts` (new), `session.ts` (add field), `PinnedContextCard.tsx` (new) |
| B | Research subagent + cache (library/topic/version keyed, TTL tiers) | `research/researchSubagent.ts` (new), `research/researchCache.ts` (new) |
| C | Slash commands + composer toggle (`/research`, `/spec-with-research`, `/implement-with-research`) | `.claude/commands/*.md`, composer toggle |
| D | Packet injection + outcome correlation | `chatOrchestrationBridge*.ts`, `researchCorrelation.ts` (new) |
| E | Status streaming + workspace read-list | ambient indicator, Settings surface |

## Feature flag

`research.explicit` (default `true`) gates the slash commands and pinned context UI.

## Pinned context primitive (Phase A — foundation)

- `PinnedContextItem = { id; type: 'research-artifact' | 'user-file' | 'symbol-neighborhood' | 'graph-blast-radius'; source; title; content; tokens; addedAt; dismissed?: boolean }`
- Session field `pinnedContext: PinnedContextItem[]` (capped at 10 active pins; dismissed items stay for undo within the session)
- Always included in context packet with tokens counted against budget (Phase D wires this)
- IPC: `pinnedContext:add`, `pinnedContext:remove`, `pinnedContext:dismiss`, `pinnedContext:list`, `pinnedContext:changed`
- UI: collapsible cards above the composer in AgentChatWorkspace

## Research cache TTL matrix

| Tier | Libraries | TTL |
|---|---|---|
| High-velocity | Next.js, React, Vercel AI SDK, shadcn | 48 h |
| Mid | Prisma, Tailwind | 7 d |
| Stable | Lodash, Express | 30 d |
| System | Node.js, web standards | 90 d |

User-editable in Settings (future polish).

## Risks

- Subagent latency → status streaming (Phase E), user-cancel
- Hallucinated sources → artifact must cite, click-through to verify
- Pin sprawl → per-session cap at 10; require user dismissal before adding more
- Token budget explosion → artifact capped at 1.5-2K tokens; full stored in DB, only summary re-sent

## Acceptance (wave total)

- `/research <topic>` → artifact within 15 s typical, pins to session
- Cache hit < 500 ms on same (library, topic, version)
- Pin card visible, collapsible, dismissable
- Workspace read-list persists across sessions for a project
- Research → implementation outcome correlation captured in telemetry
