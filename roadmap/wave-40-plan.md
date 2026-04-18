# Wave 40 — System Cleanup & Deprecation

## Implementation Plan

**Version target:** v2.6.0 (minor — consolidates cleanup).
**Feature flag:** N/A.
**Dependencies:** All prior waves default-on for ≥ 2 releases.
**Reference:** `roadmap/roadmap.md:1875-1910`.

**Goal:** Retire dead code, remove migration fallbacks, consolidate docs, deprecate unused features — the scheduled sweep.

**Note about Wave 39:** The roadmap declares Wave 39 (Research Classifier) CONTINGENT — "skipped if Wave 30 telemetry shows rules + cache sufficient". Without ≥ 8 weeks of auto-firing telemetry to justify a classifier, Wave 39 is formally skipped. Wave 40 proceeds as the final wave.

**Prior waves being cleaned up (confirm each still warrants removal before acting):**
- Wave 19 `semantic_match` / `active_file` / `open_file` dead reasons in `contextSelector.ts`.
- Wave 31 `REASON_WEIGHTS` constant (additive-weight path, superseded by learned ranker).
- Wave 16 legacy `windowSessions` config key.
- Wave 17 `panelSizes` localStorage fallback.
- `streamingInlineEdit` feature flag (long-standing tech debt per CLAUDE.md).
- `internalMcp` module (implemented, never wired — evaluate: wire or delete).

---

## Phase breakdown

| Phase | Scope | Files |
|-------|-------|-------|
| A | **Audit — don't break anything.** Before any removal: (1) grep each dead identifier across the codebase; (2) run `knip.config.ts` with no exclusions to get a full dead-code report; (3) for each candidate, verify NO callers remain. Produce `roadmap/wave-40-audit-report.md` (not committed to docs — a scratch artifact) documenting which removals are SAFE and which have surprising live callers. | Audit report (temporary), `knip` run, grep sweeps |
| B | **Remove dead context reasons.** `semantic_match`, `active_file`, `open_file` reasons in `contextSelector.ts` + any feature-extraction. Clean up the reason enum + tests. Do NOT disturb live reasons. | `src/main/orchestration/contextSelector.ts`, related test files |
| C | **Remove `REASON_WEIGHTS` additive path.** Wave 31's `context.learnedRanker` has been default-eligible ≥ 1 release. Delete the additive-weight fallback; the learned ranker is now the only path. Keep the classifier + retrain trigger intact. | `contextSelector.ts`, `REASON_WEIGHTS` declaration, related tests |
| D | **Remove `windowSessions` legacy key.** Per-window project roots now live in `ManagedWindow.projectRoots` (Wave 16+). Old `config.windowSessions` read path is dead. Drop the config key + migration shim. | `windowManager*.ts`, config schema (delete `windowSessions`), migration code if any |
| E | **Remove `panelSizes` localStorage fallback.** Wave 17 layout presets load sizes from presets; localStorage-only reads are dead. Drop the fallback, keep electron-store persistence. | `useResizable.ts`, localStorage-read code paths |
| F | **Remove `streamingInlineEdit` feature flag.** Long-standing tech debt. If the feature is working, inline the enabled path and delete the flag + `useStreamingInlineEditFlag.ts`. If the feature is broken, delete it entirely (flag + implementation). Decision: grep current usage + check git blame — default to inlining the enabled path. | `config.ts` (drop flag), `useStreamingInlineEditFlag.ts` (delete), consumers (unconditional) |
| G | **`internalMcp` decision.** The module is implemented but never wired (per CLAUDE.md). Wave 40 decision: DELETE unless a concrete consumer exists. Revisit at end — if a wave since 29 has started wiring it (Wave 33a+ integrated MCPs elsewhere?), keep; otherwise remove wholesale. | `src/main/internalMcp/` (delete or wire) |
| H | **Knip audit zero-dead.** Run `knip` with current config. For each reported dead export in `orchestration/`, `research/`, `session/`: verify unused, delete. Close the ticket: `knip` should report zero in those modules. | Whatever files `knip` flags in the three modules |
| I | **Consolidate docs.** Add `docs/context-injection.md` covering the full context pipeline (v3 learned ranker). Update `docs/architecture.md` with Session primitive + layout presets. Update `CLAUDE.md` "Known Issues / Tech Debt" — remove closed items (double terminal tab bar — if still present, flag; Settings modal inline — if still present, flag; `internalMcp` — closed by Phase G; `streamingInlineEdit` — closed by Phase F; GC policy — evaluate). | `docs/context-injection.md` (new), `docs/architecture.md`, `CLAUDE.md` |
| J | **Capstone verification + final handoff.** Full vitest suite, tsc, lint all green. Final `roadmap/session-handoff.md` update declaring the roadmap complete. | Full verification |

---

## Architecture notes

**Phase A audit is non-negotiable.** It's cheap insurance against deleting live code. Each subsequent phase's subagent must reference the audit report before removing.

**Feature flag removal policy (Phase F):**
Per `roadmap/roadmap.md:1921`: "Flags are not removed until at least 2 releases after default-on." `streamingInlineEdit` has been on long enough per the CLAUDE.md tech-debt note. Other flags from recent waves (Waves 31-38) are NOT old enough and stay.

**`internalMcp` disposition (Phase G):**
If the module has grown callers between Wave 29 and now, keep + finish wiring. If no callers, delete. The decision criterion is: `git log --oneline src/main/internalMcp/` — if only authorship commits exist and no integration commits, delete.

**Docs consolidation (Phase I):**
`docs/context-injection.md` is new — doesn't exist. Write it fresh covering v1 → v2 → v3 context scorer history + current feature extraction + classifier + reranker + lean packet mode.

**CLAUDE.md "Known Issues" audit:**
Re-read the list. For each item, grep to verify it's still present. If fixed in a prior wave, remove from the list. Don't leave stale "known issues" that no longer apply.

---

## Risks

- **"Dead code" that isn't.** Phase A audit is the guardrail. If a subagent wants to delete something Phase A flagged as "live surprising caller", it must STOP and report.
- **Breaking migrations.** Some removals (Phase D `windowSessions`, Phase E `panelSizes` fallback) might strand users on old configs. Mitigation: add a one-time migration that reads the old key and writes the new one, then deletes. Migration code stays for one more release.
- **`streamingInlineEdit` regression.** If the flag's disabled path was the "stable" one, inlining the enabled path may expose latent bugs. Test the full chat flow manually after removal.
- **Knip false positives.** Knip sometimes flags type-only exports as dead. Leave obvious false positives; don't try to delete types that are consumed via `import type`.
- **Docs drift.** Writing `docs/context-injection.md` requires actually reading the current context pipeline code. Don't paraphrase from outdated notes.

---

## Acceptance

- `knip` reports zero dead exports in `src/main/orchestration/`, `src/main/research/` (if it exists), `src/main/session/`.
- `grep -r "semantic_match\|active_file\|open_file\|REASON_WEIGHTS\|windowSessions\|panelSizes.*localStorage\|streamingInlineEdit" src/` returns ONLY the migration-helpers' temporary reads or nothing (migration helpers may reference old keys for one more release).
- `src/main/internalMcp/` either deleted OR actively consumed by at least one other module.
- `docs/context-injection.md` exists and references current file paths.
- `docs/architecture.md` updated (diff shows real content, not just timestamp).
- `CLAUDE.md` "Known Issues" list audited; closed items removed.
- Full tsc / lint / vitest / playwright suites green.

---

## Exit criteria

- One release cycle passes after Wave 40 with no regressions attributable to the cleanup.

---

## Per-phase commit format

`chore: Wave 40 Phase X — short summary`

(`chore:` for cleanup, NOT `feat:` — no new features this wave.)

Co-author trailer:
```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Parent pushes once after Phase J.
