# Async subagent eviction — live A/B test plan

**Status:** Plan, not yet executed.
**Drafted:** 2026-04-27
**Companion docs:** `issues/subagent-thinking-zero.md` (prior investigation, partially superseded by this one)
**GitHub issue (filed separately):** see `~/.claude/rules/agent-catalog.md` "Synchronous dispatch only" section for the link once the issue exists.

---

## Why this exists

The prior synthetic test (2026-04-27) ran two single-trial dispatches on a clean utility-module task — one with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=0`, one with `=1`. **Both completed cleanly.** This was unexpected given the historical cut rate of ~77% for `sonnet-implementer × async × heavy parent activity` on this CLI version (2.1.119).

The synthetic test under-stressed the parent. Real Wave dispatches involve:
- Multi-file edits across the user's actual repo
- Heavy parallel-batch orchestration (multiple parent tool calls in flight)
- Big context-building reads (CLAUDE.md, project rules, multiple component files)
- Rapid orchestrator turns
- Long-running agent loops (10–30 min)

The synthetic test had only:
- New-file writes in isolation (no repo context churn)
- Moderate parent chat (3 substantive prompts)
- ~6 min agent runtime

The teams hypothesis cannot be ruled out from a single trial under moderate stress. The live A/B is the durable answer.

---

## What the live test must do differently

1. **Use real Wave work, not a synthetic task.** Pick a Wave phase you would have dispatched anyway — same load, no extra usage cost.
2. **Heavy parent activity throughout the dispatch.** The orchestrator should generate constant parent turns: parallel file reads, greps, git diffs, status checks, planning text. Mimic the orchestrator pattern that produced the historical 77% cut rate, not the moderate chat we used in the synthetic.
3. **N ≥ 3 per cell**, not N = 1. Single trials carry the historical 23% lucky-clean rate as noise.
4. **Same dispatch shape both cells** — pick one Wave phase prompt, run it identically with the only difference being the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` env value.

---

## Test cells

Minimum viable design (4 dispatches, 2 cells × 2 trials):

| Cell | env | dispatch | parent load |
|---|---|---|---|
| A1 | `EXPERIMENTAL_AGENT_TEAMS=0` | `sonnet-implementer` async, real Wave phase prompt | heavy (parallel reads, diffs, status checks) |
| A2 | `EXPERIMENTAL_AGENT_TEAMS=0` | same prompt, second trial | heavy |
| B1 | `EXPERIMENTAL_AGENT_TEAMS=1` | same prompt, third trial | heavy |
| B2 | `EXPERIMENTAL_AGENT_TEAMS=1` | same prompt, fourth trial | heavy |

Stronger design if usage budget allows (6–8 dispatches, 3–4 trials per cell): adds enough samples to claim statistical confidence.

---

## Setup procedure (per session)

Before each dispatch:

1. **Set the env var.**
   - Cell A: `~/.claude/settings.json` → `"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "0"`
   - Cell B: `~/.claude/settings.json` → `"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"`
2. **Open a fresh terminal session** so the env var takes effect.
3. **Flip the hook** at `~/.claude/hooks/agent_catalog_enforce.mjs` — set `ASYNC_DISPATCHES_BLOCKED = false`.
4. **Verify** in the new session: `echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` matches the cell value.
5. **Start the monitor** (the `tmp_monitor.py` script in the project root, or recreate equivalent).
6. **Dispatch** the real Wave phase using `sonnet-implementer` with `run_in_background: true`.
7. **Generate heavy parent activity** for the duration: parallel reads, greps, diffs, git status, write planning notes. Don't pause for more than 30 seconds at a time.
8. **Capture monitor checkpoints** every 60–90 seconds.
9. **At completion** (or if you suspect a cut at >5 min of frozen `last_ts`):
   - Read the agent's transcript metadata via the monitor script — note `last_role`, `last_assistant_stop_reason`, total cache stats
   - Verify the work the agent claimed to do actually landed (run tests, check files, inspect git diff)
   - Record the result in this doc's results section
10. **Reset the hook** — set `ASYNC_DISPATCHES_BLOCKED = true`.

---

## Data to capture per trial

For each dispatch, record:

```
Trial: [A1 | A2 | B1 | B2 | ...]
Date: <YYYY-MM-DD HH:MM>
CLI version: <claude --version>
Agent ID: <agent-XXXX>
Session ID: <UUID>
Wave / phase: <e.g. "Wave 60 Phase B">
Task summary: <one line>
Duration (s): <last_ts - first_ts>
Records: <total>
Assistant turns: <n>
Tool uses emitted: <n>
last_role: <assistant | user>
last_assistant_stop_reason: <end_turn | tool_use | stop_sequence>
Total cache_creation_tokens: <n>
Total cache_read_tokens: <n>
Cache hit rate: <%>
Max cache_creation per turn: <n>  ← watch for spikes
Verification: <tests pass? lint clean? files match?>
Cut classification: [clean | cut-mid-tool-use | cut-mid-assistant | inconclusive]
Parent activity intensity: [light | moderate | heavy]
Notes: <anything notable — early input-token spikes, MCP disconnects, etc.>
```

---

## Analysis criteria

After all trials complete:

1. **Cut rate per cell.** If teams=on shows ≥ 2× higher cut rate than teams=off, the hypothesis is supported. If they're within noise (e.g. 0/3 vs 1/3), it's not.
2. **Parent-activity-within-10s correlation.** Confirm the 22/22 historical pattern reproduces in any new cuts.
3. **Cache invalidation pattern.** Look for cache_creation spikes mid-run on cut transcripts vs steady cache_read on clean ones. The synthetic test saw a single early spike on the teams=on run that did NOT lead to a cut — interesting but not predictive on N=1.
4. **Misleading completion status.** Confirm the harness still reports `<status>completed</status>` for any cut tasks observed (this is the secondary bug, separate from the eviction itself).

---

## What "good" looks like

- **If the bug reproduces under heavy load AND teams=on shows higher cut rate than teams=off:** strong A/B evidence; update the GitHub issue with the additional data.
- **If the bug reproduces under heavy load BUT teams setting doesn't move the needle:** parent-activity correlation is the cause; teams hypothesis is falsified. Update issue framing accordingly.
- **If the bug doesn't reproduce at all in N≥3 per cell on the current CLI:** the regression may have been silently fixed in a recent point release, or the trigger requires conditions we still haven't isolated. Update issue with new sample.

---

## Cleanup checklist after the test

- [ ] Reset `ASYNC_DISPATCHES_BLOCKED = true` in `~/.claude/hooks/agent_catalog_enforce.mjs`
- [ ] Decide final value for `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` based on results, set in `~/.claude/settings.json`
- [ ] Update the GitHub issue with the new findings
- [ ] Add a results section to this file with the per-trial data and the conclusion
- [ ] Move or delete `tmp_monitor.py` from project root

---

## Results

(To be filled in when the live test runs.)

| Trial | Cell | Duration | Records | Stop reason | Verification | Classification |
|---|---|---|---|---|---|---|
| A1 | teams=0 | | | | | |
| A2 | teams=0 | | | | | |
| B1 | teams=1 | | | | | |
| B2 | teams=1 | | | | | |

**Conclusion:** _(fill in)_
