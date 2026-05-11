---
status: OPEN
created: 2026-05-11
updated: 2026-05-11
---

# Context preview pre-send misses CLAUDE.md (one rule short of post-send count)

## Symptom

The context-preview popover's User rules tab shows 18 entries before the first chat message is sent, then 19 after. The extra entry is `~/.claude/CLAUDE.md`.

## Cause (read-only diagnosis)

The popover's `useActiveSessionRulesAndSkills` hook has two branches:

- **`no-session` branch** (claudeSessionId is null, pre-send): reads rule files via the `listRuleFiles` IPC, which enumerates `~/.claude/rules/*.md` only. CLAUDE.md is not in `rules/` so it isn't included.
- **`session-found` branch** (claudeSessionId is set, post-send): reads `session.loadedRules` populated from hook-pipe `instructions_loaded` events. Claude Code itself reports CLAUDE.md as a loaded rule, so it appears here.

Surfaced during Wave 84 Phase A repro after the suppression fix (commit `821435c1`) made the post-send branch actually populate.

## Recommended fix shape

Align the two sources so the popover shows the same set in both states. Options:

1. **Augment `listRuleFiles`** to also include `~/.claude/CLAUDE.md` (and probably `<projectRoot>/CLAUDE.md` for the Project tab) as user rules. Cheapest, keeps the pre-send branch as the source of truth.
2. **Filter `loadedRules`** to exclude CLAUDE.md if the pre-send branch is considered canonical. Worse — hides real loaded context.
3. **Use `loadedRules` for both states** (replace `listRuleFiles` with a pre-session enumeration that mirrors what Claude Code would load). Most consistent but biggest change.

Option 1 is the smallest fix and is consistent with showing "what will be loaded into Claude's context" — which is what the popover claims to show.

## Out of scope

- The "store grows unboundedly" issue surfaced separately during Phase A logs (storeSessionIds had ~100 UUIDs from prior chats accumulated in renderer memory). File separately if not already filed.

## Severity

Low. Doesn't affect functionality — the user sees their rules listed correctly post-send. The 18→19 jump is just a minor inconsistency between the two display states.
