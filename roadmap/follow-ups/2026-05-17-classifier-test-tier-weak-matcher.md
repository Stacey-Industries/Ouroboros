---
status: OPEN
created: 2026-05-17
updated: 2026-05-17
type: test-quality
parent-initiative: Test-discipline framework (cross-project audit)
---

# Weak matcher in classifier.test.ts

## Context

Surfaced during Wave M-6 meta-sweep (2026-05-17). `src/main/router/classifier.test.ts` contains the canonical "weak matcher" anti-pattern: asserts that the result is one of three valid tiers, rather than asserting the result is the correct tier for the given input. A test of shape `assert(result === 'tier-a' || result === 'tier-b' || result === 'tier-c')` would pass even if classifier always returns 'tier-a' regardless of input.

## Proposed action

1. Identify the specific assertions in `classifier.test.ts` matching this pattern.
2. Replace `result is one of valid values` with `result equals expected value for input X`.
3. Verify mutation score on `classifier.ts` improves after the tightening (per Tier 0/1 anti-tautology discipline in test-discipline framework).

## Cross-reference

Tracked at meta-framework level too: `C:\Web App\meta\roadmap\follow-ups\` is the meta inbox; this file is the project-specific work. Meta inbox does NOT duplicate; it just notes "Agent IDE-specific weak test work tracked at the project level."

## Related

- `meta/CHANGELOG.md` [0.5.0] test-discipline framework rollout
- `~/.claude/agents/sonnet-implementer.md` (anti-tautology rules in agent prompt)
