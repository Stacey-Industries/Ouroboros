---
status: OPEN
created: 2026-05-16
updated: 2026-05-16
source: wave-93 ship tail (noticed during CI watch)
---

# `.github/workflows/mobile-android-release.yml` fails on every push (workflow file issue)

## Symptom

Every push to master (or any branch) fires this workflow and it fails in 0 seconds with the message:

> This run likely failed because of a workflow file issue.

Reproduces back to at least Wave 92 ship tail (2026-05-16 07:51 UTC) and continues through Wave 93 ship (2026-05-16 18:26 UTC). Five+ consecutive failures.

## Diagnosis pointer

The `0s` duration + GitHub's "workflow file issue" framing means the YAML didn't parse, OR a referenced action / runner was unavailable at parse time. Did NOT execute any steps. Run ID examples: `25969499793` (Wave 93 push), `25956685840` (Wave 92 HANDOFF flip push), `25956643475` + `25956623693` (Wave 92 PR merge).

## Why it's not blocking

The Agent IDE's primary `CI` workflow (Ubuntu/Windows/macOS test matrix + lockfile canary) and the `Mutation Testing (Stryker)` workflow run independently and succeed. The mobile-android-release workflow appears to be either:
1. A relic from a mobile-shell exploration that was never finished or
2. A workflow intended to fire only on tags/releases that's incorrectly configured to fire on all pushes

Either way it's noise — no actual Android packaging is happening.

## Recommended fix

Two paths:
1. **If mobile Android packaging is still wanted**: fix the workflow's YAML / action references. Likely the action versions are stale (deprecated, removed, or moved).
2. **If not**: delete the workflow file. The mobile/iOS deferred work at `roadmap/deferred/ios-mobile-packaging.md` and `roadmap/deferred/mobile-access-and-session-dispatch.md` are the canonical places for that initiative; killing the workflow doesn't drop the planning thread.

## Not in scope

- Investigating the workflow file itself (would need GitHub Actions log access + the workflow YAML in hand).
- Mobile packaging in general — see the deferred items.

## Suggested next-step shape

5-minute investigation: `cat .github/workflows/mobile-android-release.yml`, identify whether the failure is action-version or trigger-config, decide path 1 or 2 above, ship a one-commit fix or delete.
