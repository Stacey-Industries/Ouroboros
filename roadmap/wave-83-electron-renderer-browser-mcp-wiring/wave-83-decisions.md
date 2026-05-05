# Wave 83 — Architecture Decisions

Five decisions are locked from discovery + Stage 2 review. Phase 0 transcribes them here using the per-decision format from `~/.claude/rules/best-practice-spectrum.md`. Each follows the abbreviated `Context / Pick / Rationale` form because they were already debated during discovery — the spectrum framing was applied there, the picks landed there, and this file is the durable record.

## Decision 1: Path C (Playwright-electron repro harness) over Path A or Path B

**Context:**

## Decision 2: Repro target is the built artifact (`out/main/index.js`), not the dev server

**Context:**

## Decision 3: Repro specs are authored as `.spec.ts` files directly, not via a custom JSON/YAML scenario DSL

**Context:**

## Decision 4: Two Playwright projects (`electron` for CI, `repro-electron` for repros) with disjoint discovery rules

**Context:**

## Decision 5: Path B (`app.commandLine.appendSwitch('remote-debugging-port', …)`) is parked as a separate follow-up

**Context:**
