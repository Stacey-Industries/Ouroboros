---
status: SCHEDULED
created: 2026-05-05
updated: 2026-05-05
target: web variant graduation (no specific wave yet)
source: workspace conversation 2026-05-05 — IPC vs contracts architectural discussion
---

# Formalize IPC contract as a `packages/contracts/` workspace when `src/web/` graduates

## Why this lives in `deferred/` not as immediate work

Today, Agent IDE's IPC contract lives at `src/renderer/types/electron*.d.ts`. TypeScript enforces it at compile time across main + preload + renderer because all three processes ship in one bundle. There is no HTTP boundary; runtime validation at IPC borders is defensible but not urgent. **For the desktop-only path, this is sufficient.**

Formalizing the contract into a separate workspace package (analogous to ArcFlow's `packages/contracts/` with Zod schemas) would be over-engineering today — it adds build complexity without solving a real problem the desktop app has.

## When this item activates

When `src/web/` transitions from a stub (currently exercised only by `test:web`) into a **first-class deploy target** — either:

- A Capacitor-built mobile app
- A standalone web build (browser-only IDE shell)
- Any path where the renderer communicates with a non-Electron backend over HTTP / WebSocket / similar transport

At that point, the cross-boundary contract genuinely needs:

- Runtime validation (HTTP boundary brings real version-skew risk between client and server deploys)
- Independent deployability (web client and electron main may ship on different cadences)
- A single source of truth importable from multiple consumers (electron main, web server, mobile shell)

That's exactly the shape that motivates ArcFlow's contracts package, and the cost-benefit flips in favor of formalizing.

## What the work looks like at activation

Roughly:

1. **Create `packages/contracts/`** workspace with Zod schemas for every IPC channel currently in `src/renderer/types/electron*.d.ts`.
2. **Generate TypeScript types from Zod schemas** for compile-time use (instead of hand-written `.d.ts`).
3. **Add runtime validation in main-process IPC handlers** at the boundary — reject malformed payloads, log structured errors.
4. **Update preload bridge** to import schemas from `@ouroboros/contracts` (or whatever the package name lands on).
5. **Migrate the renderer types** to be re-exports from the contracts package.
6. **Add ADR** (`roadmap/decisions/ipc-contracts-package.md`) capturing the choice and the rationale.

Estimated wave shape: 4-6 phases. Coupled with the web/Capacitor work that triggers it; not a standalone wave.

## What changes if this is NEVER activated

If Agent IDE remains desktop-only forever, this item ages into `WONTFIX` after enough triage cycles — the IPC types in their current shape are the canonical answer for that path. The conditional activation is the whole point of `deferred/` vs. `follow-ups/` (which would imply work).

## References

- Source discussion: workspace conversation 2026-05-05 (between Cole + Claude orchestrator)
- Pattern reference (ArcFlow's contracts package): `C:\Web App\Contractor App\packages\contracts\`
- Existing IPC types: `src/renderer/types/electron*.d.ts`
- Repo IPC convention: `.claude/rules/ipc-contract.md` (channel naming `domain:action`, response shape `{ success: boolean; error?: string }`)
- Pipeline rule on durable vs wave-scoped ADRs: `~/.claude/rules/best-practice-spectrum.md`
